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
    let buffer = "";
    let codesInChunk = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

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

      buffer += (buffer ? '\n' : '') + line;

      if (buffer.length >= 1000 || i === lines.length - 1) {
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

        buffer = "";
        codesInChunk.clear();
      }
    }

    const BATCH_SIZE = 5; 
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      
      // Check if this batch was already processed (idempotency)
      const { data: existing } = await supabase
        .from('document_chunks')
        .select('chunk_index')
        .eq('document_id', documentId)
        .gte('chunk_index', i)
        .lt('chunk_index', i + BATCH_SIZE);
      
      if (existing && existing.length === batch.length) {
        console.log(`Batch ${i / BATCH_SIZE + 1} already indexed. Skipping.`);
        continue;
      }

      if (jobId) {
        const progressPercent = Math.round(70 + ((i / nodes.length) * 25)); // EMBED step is 70-95%
        await supabase.from('ingestion_jobs').update({ 
          payload: { 
            processed: i, 
            total: nodes.length, 
            status: 'generating_vectors',
            progress: progressPercent,
            message: `Vectorizing batch ${Math.ceil(i / BATCH_SIZE) + 1} of ${Math.ceil(nodes.length / BATCH_SIZE)}...`
          } 
        }).eq('id', jobId);
      }

      console.log(`Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(nodes.length / BATCH_SIZE)}`);
      const embeddings = await generateEmbeddingsBatch(batch.map(n => n.text));
      console.log(`Embeddings generated for batch ${i / BATCH_SIZE + 1}`);
      
      const records = batch.map((node, j) => ({
        document_id: documentId,
        chunk_text: node.text,
        embedding: embeddings[j],
        slo_codes: node.metadata.slo_codes,
        semantic_fingerprint: node.fingerprint,
        token_count: node.metadata.tokens,
        chunk_index: i + j,
        metadata: node.metadata
      }));

      console.log(`Inserting batch ${i / BATCH_SIZE + 1} into document_chunks`);
      const { error: insertError } = await supabase.from('document_chunks').insert(records);
      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }
      console.log(`Batch ${i / BATCH_SIZE + 1} inserted successfully`);
    }

    return { success: true, count: nodes.length };
  } catch (error: any) {
    console.error("❌ [Indexer Fault]:", error.message);
    throw error;
  }
}