import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';
import { Buffer } from 'buffer';

/**
 * ADVANCED STRUCTURE-AWARE INDEXER (v7.0)
 * Logic: Tree-based chunk graph with Explicit Performance Metrics.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  supabase: SupabaseClient,
  jobId?: string
) {
  try {
    const lines = content.split('\n');
    const dialect = content.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

    let currentSubject = "N/A";
    let currentGrade = "N/A";
    let currentDomain = "N/A";
    
    const nodes: any[] = [];
    let lineBuffer: string[] = [];
    let currentSize = 0;
    let codesInChunk = new Set<string>();

    const CHUNK_SIZE_LIMIT = 1500; // Increased for better context
    const OVERLAP_LINES = 3; // Keep last 3 lines for context overlap

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Track hierarchical context
      if (line.match(/^Board:|^Subject:/i)) {
        currentSubject = line.split(':')[1]?.trim() || currentSubject;
      } else if (line.startsWith('# GRADE')) {
        currentGrade = line.replace('# GRADE', '').trim();
      } else if (line.startsWith('### DOMAIN')) {
        currentDomain = line.replace('### DOMAIN', '').trim();
      }

      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => { 
        const normalized = normalizeSLO(c.code);
        if (normalized) codesInChunk.add(normalized);
      });

      lineBuffer.push(line);
      currentSize += line.length;

      // Flush chunk if limit reached or end of document
      if (currentSize >= CHUNK_SIZE_LIMIT || i === lines.length - 1) {
        const buffer = lineBuffer.join('\n');
        const fingerprint = Buffer.from(buffer.trim()).toString('base64').substring(0, 50);
        const contextPath = `[NODE_PATH: ${currentSubject} > ${currentGrade} > ${currentDomain}]`;
        const enrichedText = `${contextPath}\n${buffer.trim()}`;

        nodes.push({
          text: enrichedText,
          fingerprint,
          metadata: {
            subject: currentSubject,
            grade: currentGrade,
            domain: currentDomain,
            slo_codes: Array.from(codesInChunk),
            dialect,
            tokens: Math.max(1, Math.ceil(enrichedText.length / 4))
          }
        });

        // Overlap logic: keep last N lines for the next chunk
        const actualOverlap = Math.min(lineBuffer.length, OVERLAP_LINES);
        lineBuffer = lineBuffer.slice(lineBuffer.length - actualOverlap);
        currentSize = lineBuffer.reduce((acc, l) => acc + l.length, 0);
        
        // We don't clear codesInChunk completely if we overlap, 
        // but for simplicity in RAG, we'll clear and let the next iteration find them again in the overlap lines
        codesInChunk.clear();
        // Re-scan overlap lines for codes to ensure they are attributed to the next chunk too
        lineBuffer.forEach(l => {
          extractSLOCodes(l).forEach(c => {
            const normalized = normalizeSLO(c.code);
            if (normalized) codesInChunk.add(normalized);
          });
        });
      }
    }

    if (nodes.length === 0) {
      console.warn("[Indexer] No nodes found to index.");
      return { success: true, count: 0 };
    }

    const { data: existingChunks } = await supabase
      .from('document_chunks')
      .select('chunk_index')
      .eq('document_id', documentId);
    
    const indexedIndices = new Set(existingChunks?.map(c => c.chunk_index) || []);

    const BATCH_SIZE = 50; 
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      
      // Filter out nodes that are already indexed
      const freshBatch = batch.map((node, idx) => ({ node, originalIndex: i + idx }))
                            .filter(item => !indexedIndices.has(item.originalIndex));
      
      if (freshBatch.length === 0) {
        console.log(`Batch ${Math.ceil(i / BATCH_SIZE) + 1} already fully indexed. Skipping.`);
        if (jobId) {
          const progressPercent = Math.round(85 + ((i + batch.length) / nodes.length) * 14);
          await supabase.from('ingestion_jobs').update({ progress: progressPercent }).eq('id', jobId);
        }
        continue;
      }

      if (jobId) {
        // RAG step is 85-99% (scaled by nodes processed)
        const progressPercent = Math.round(85 + ((i / nodes.length) * 14)); 
        await supabase.from('ingestion_jobs').update({ 
          status: 'processing',
          step: 'EMBED', 
          updated_at: new Date().toISOString(), 
          payload: { 
            processed: i, 
            total: nodes.length, 
            status: 'generating_vectors',
            progress: progressPercent,
            message: `Vectorizing fresh items in batch ${Math.ceil(i / BATCH_SIZE) + 1}... (${freshBatch.length} new)`
          } 
        }).eq('id', jobId);
      }

      console.log(`Processing ${freshBatch.length} new nodes in batch ${Math.ceil(i / BATCH_SIZE) + 1}`);
      const embeddings = await generateEmbeddingsBatch(freshBatch.map(item => item.node.text));
      
      const records = freshBatch.map((item, j) => {
        const vec = embeddings[j];
        if (!vec) return null;

        return {
          document_id: documentId,
          chunk_text: item.node.text,
          embedding: vec,
          slo_codes: item.node.metadata.slo_codes,
          semantic_fingerprint: item.node.fingerprint,
          token_count: item.node.metadata.tokens,
          chunk_index: item.originalIndex,
          metadata: item.node.metadata
        };
      }).filter((r): r is NonNullable<typeof r> => r !== null);

      if (records.length === 0) {
        console.warn(`[Indexer] Batch ${Math.ceil(i / BATCH_SIZE) + 1} produced zero valid embeddings. Skipping insertion.`);
        continue;
      }

      console.log(`Inserting ${records.length} records for batch ${Math.ceil(i / BATCH_SIZE) + 1}`);
      const { error: insertError } = await supabase.from('document_chunks').insert(records);
      if (insertError) {
        console.error("Insert error:", insertError);
        // If it's a duplicate key error despite our check, it might be a race condition.
        // We'll log it and continue if it's a duplicate, otherwise throw.
        if (insertError.code === '23505') {
           console.warn("Race condition: Duplicate key detected during insert. Skipping record.");
        } else {
           throw insertError;
        }
      }
    }

    return { success: true, count: nodes.length };
  } catch (error: any) {
    console.error("❌ [Indexer Fault]:", error.message);
    throw error;
  }
}