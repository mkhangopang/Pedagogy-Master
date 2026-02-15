
import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';
import { Buffer } from 'buffer';

/**
 * ADVANCED STRUCTURE-AWARE INDEXER (v5.0)
 * Logic: Tree-based chunk graph with "Context Carry-Forward" & Fingerprinting.
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

    let currentGrade = "N/A";
    let currentChapter = "N/A";
    let currentDomain = "N/A";
    
    const nodes: any[] = [];
    let buffer = "";
    let codesInChunk = new Set<string>();

    // 1. Structural Decomposition
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('# GRADE')) {
        currentGrade = line.replace('# GRADE', '').trim();
      } else if (line.startsWith('## CHAPTER')) {
        currentChapter = line.replace('## CHAPTER', '').trim();
      } else if (line.startsWith('### DOMAIN')) {
        currentDomain = line.replace('### DOMAIN', '').trim();
      }

      const foundCodes = extractSLOCodes(line);
      foundCodes.forEach(c => { 
        const normalized = normalizeSLO(c.code);
        if (normalized) codesInChunk.add(normalized);
      });

      buffer += (buffer ? '\n' : '') + line;

      const nextLine = lines[i+1]?.trim() || "";
      const isHeaderChange = nextLine.startsWith('#');

      // Adaptive Chunking (1000 chars or Header Break)
      if (buffer.length >= 1000 || isHeaderChange || i === lines.length - 1) {
        const fingerprint = Buffer.from(buffer.trim()).toString('base64').substring(0, 50);
        
        // Context Carry-Forward: Prepend high-level metadata to the embedding string
        const contextHeader = `[CONTEXT: Grade ${currentGrade} | Ch ${currentChapter} | Domain ${currentDomain}]\n`;
        const enrichedText = contextHeader + buffer.trim();

        nodes.push({
          text: enrichedText,
          fingerprint,
          metadata: {
            grade: currentGrade,
            chapter: currentChapter,
            domain: currentDomain,
            slo_codes: Array.from(codesInChunk),
            dialect,
            tokens: Math.ceil(enrichedText.length / 4)
          }
        });

        buffer = "";
        codesInChunk.clear();
      }
    }

    // 2. Batch Processing with Deduplication
    const BATCH_SIZE = 5; // Small batches to avoid free-tier timeouts
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      
      // Update Job status for UI progress
      if (jobId) {
        await supabase.from('ingestion_jobs').update({ 
          payload: { processed: i, total: nodes.length } 
        }).eq('id', jobId);
      }

      // SHA-deduplication check
      const fingerprints = batch.map(n => n.fingerprint);
      const { data: existing } = await supabase.from('document_chunks')
        .select('semantic_fingerprint')
        .in('semantic_fingerprint', fingerprints);
      
      const existingFp = new Set(existing?.map(e => e.semantic_fingerprint) || []);
      const toProcess = batch.filter(n => !existingFp.has(n.fingerprint));
      
      if (toProcess.length > 0) {
        const embeddings = await generateEmbeddingsBatch(toProcess.map(n => n.text));
        
        const records = toProcess.map((node, j) => ({
          document_id: documentId,
          chunk_text: node.text,
          embedding: embeddings[j],
          slo_codes: node.metadata.slo_codes,
          semantic_fingerprint: node.fingerprint,
          token_count: node.metadata.tokens,
          metadata: node.metadata,
          chunk_index: i + j
        }));

        await supabase.from('document_chunks').insert(records);
      }
    }

    return { success: true, count: nodes.length };
  } catch (error: any) {
    console.error("❌ [Indexer Fatal]:", error.message);
    throw error;
  }
}
