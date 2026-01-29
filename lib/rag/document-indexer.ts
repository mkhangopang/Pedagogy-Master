import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * WORLD-CLASS NEURAL INDEXER (v160.0)
 * Optimized for "Zero-AI" Latency. 
 * Re-synthesis is only performed if pre-extracted metadata is missing.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient,
  preExtractedMeta?: any
) {
  const startTime = Date.now();
  console.log(`📡 [Indexer] Zero-AI Sync Initiated for: ${documentId}`);
  
  try {
    let meta = preExtractedMeta;

    // 1. ADAPTIVE SEMANTIC CHUNKING
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^Standard:/i)) currentCtx.standard = line;
      if (line.match(/^Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      if (line.match(/^- SLO:/i) || line.match(/^#{1,3}\s+/) || i === lines.length - 1) {
        if (buffer.length > 50) {
          const sloMatches = buffer.match(/[B-Z]-\d{2}-[A-Z]-\d{2}|S-\d{2}-[A-Z]-\d{2}/gi) || [];
          const normalizedSLOs = Array.from(new Set(sloMatches.map(c => normalizeSLO(c))));

          processedChunks.push({
            text: buffer.trim(),
            metadata: {
              ...currentCtx,
              ...meta,
              slo_codes: normalizedSLOs,
              is_slo_definition: buffer.includes('- SLO:'),
              chunk_index: processedChunks.length,
              source_path: filePath
            }
          });
        }
        buffer = line + "\n";
      } else {
        buffer += line + "\n";
      }
    }

    // 2. ATOMIC STORE RESET
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 3. BATCH PROCESSING (Optimized for Free Tier)
    const BATCH_SIZE = 15; 
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > 55000) break; 

      const batch = processedChunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));
      
      const records = batch.map((chunk, j) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[j],
        slo_codes: chunk.metadata.slo_codes,
        metadata: chunk.metadata
      }));

      await supabase.from('document_chunks').insert(records);
    }

    // 4. FINALIZE (Mark as ready instantly)
    await supabase.from('documents').update({ 
      status: 'ready', 
      rag_indexed: true 
    }).eq('id', documentId);

    console.log(`✅ [Indexer] Sync Complete in ${Date.now() - startTime}ms`);
    return { success: true };
  } catch (error: any) {
    console.error("❌ [Indexer Fault]:", error);
    try {
      await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    } catch (e) {}
    throw error;
  }
}