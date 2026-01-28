import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * HIGH-THROUGHPUT NEURAL INDEXER (v110.0)
 * Optimized for High-Resilience & Serverless Watchdog.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  const startTime = Date.now();
  console.log(`📡 [Indexer] Sync Initiated: ${documentId}`);
  
  try {
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    // 1. Hierarchical Context Decomposition
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^Standard:/i)) currentCtx.standard = line;
      if (line.match(/^Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      // Grouping on SLO boundaries for pedagogical precision
      if (line.match(/^- SLO:/i) || i === lines.length - 1) {
        if (buffer.length > 20) {
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

    console.log(`🧠 [Indexer] Processing ${processedChunks.length} neural nodes...`);

    // 2. Atomic Cache Purge
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 3. High-Concurrency Vectorization
    // Batch size of 50 allows Gemini's batch API to maximize throughput
    const BATCH_SIZE = 50; 
    const batches = [];
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      batches.push(processedChunks.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i++) {
      // 25s Serverless Watchdog: Finalize before the 30s gateway timeout
      if (Date.now() - startTime > 25000) {
        console.warn(`⏳ [Indexer] Threshold reached. Saving partial sync state.`);
        break;
      }

      const batch = batches[i];
      try {
        const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));
        
        const records = batch.map((chunk, j) => ({
          document_id: documentId,
          chunk_text: chunk.text,
          embedding: embeddings[j],
          slo_codes: chunk.metadata.slo_codes,
          metadata: chunk.metadata
        }));

        const { error: insertError } = await supabase.from('document_chunks').insert(records);
        if (insertError) throw insertError;
      } catch (batchErr: any) {
        console.error(`⚠️ [Indexer] Batch sync failure:`, batchErr.message);
        // Continue to next batch to maximize recovery
      }
    }

    // 4. Commit Final Ready State
    const { error: finalError } = await supabase.from('documents').update({ 
      status: 'ready', 
      rag_indexed: true,
      updated_at: new Date().toISOString()
    }).eq('id', documentId);

    if (finalError) throw finalError;

    console.log(`✅ [Indexer] Success. Total duration: ${(Date.now() - startTime) / 1000}s`);
    return { success: true };
  } catch (error: any) {
    console.error("❌ [Indexer Fatal]:", error);
    // Mark as failed so user can retry, wrapped in try-catch to prevent build failures or hangs
    try {
      await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    } catch (dbErr) {
      console.warn("Failed to update failure status:", dbErr);
    }
    throw error;
  }
}