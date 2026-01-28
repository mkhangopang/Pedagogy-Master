import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

/**
 * HIERARCHICAL CONTEXT TRACKER
 */
interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * CONCURRENCY-CONTROLLED INDEXER (v98.0)
 * Uses parallel streams to saturate the neural grid and speed up sync.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  try {
    console.log(`📡 [Neural Indexer] Starting Optimized Sync: ${documentId}`);
    
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    // 1. Hierarchical Decomposition
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^Standard:/i)) currentCtx.standard = line;
      if (line.match(/^Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      if (line.match(/^- SLO:/i) || i === lines.length - 1) {
        if (buffer.length > 30) {
          const sloMatches = buffer.match(/[B-Z]-\d{2}-[A-Z]-\d{2}|S-\d{2}-[A-Z]-\d{2}/gi) || [];
          const normalizedSLOs = Array.from(new Set(sloMatches.map(c => normalizeSLO(c))));

          processedChunks.push({
            text: buffer.trim(),
            metadata: {
              ...currentCtx,
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

    console.log(`🧠 [Neural Indexer] Vectorizing ${processedChunks.length} nodes in high-concurrency mode...`);

    // 2. Clear stale nodes efficiently
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 3. Parallel Batch Processing (Optimized for Throughput)
    const BATCH_SIZE = 15;
    const CONCURRENCY_LIMIT = 5;
    const batches = [];
    
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      batches.push(processedChunks.slice(i, i + BATCH_SIZE));
    }

    // Process batches with controlled concurrency
    for (let i = 0; i < batches.length; i += CONCURRENCY_LIMIT) {
      const currentBatchPool = batches.slice(i, i + CONCURRENCY_LIMIT);
      
      await Promise.all(currentBatchPool.map(async (batch) => {
        const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));
        
        const records = batch.map((chunk, j) => ({
          document_id: documentId,
          chunk_text: chunk.text,
          embedding: embeddings[j],
          slo_codes: chunk.metadata.slo_codes,
          metadata: chunk.metadata
        }));

        const { error } = await supabase.from('document_chunks').insert(records);
        if (error) throw error;
      }));
      
      // Update progress heart-beat
      const progress = Math.min(100, Math.round(((i + CONCURRENCY_LIMIT) / batches.length) * 100));
      console.log(`⏳ [Indexer] Sync Progress: ${progress}%`);
    }

    // 4. Final Verification
    await supabase.from('documents').update({ 
      status: 'ready', 
      rag_indexed: true,
      updated_at: new Date().toISOString()
    }).eq('id', documentId);

    console.log(`✅ [Indexer] Sync Complete for ${documentId}`);
    return { success: true };
  } catch (error: any) {
    console.error("❌ [Indexer Critical Error]:", error);
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    throw error;
  }
}