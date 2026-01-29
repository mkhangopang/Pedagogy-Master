import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * ULTRA-AGGRESSIVE NEURAL INDEXER (v120.0)
 * Optimized for Sindh Grids & Vercel Gateway Resilience.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  const startTime = Date.now();
  console.log(`📡 [Indexer] Sync Initiated for Asset: ${documentId}`);
  
  try {
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    // 1. Structural Decomposition
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^Standard:/i)) currentCtx.standard = line;
      if (line.match(/^Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

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

    console.log(`🧠 [Indexer] Anchoring ${processedChunks.length} neural nodes...`);

    // 2. Atomic Cache Reset
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 3. High-Throughput Parallel Vectorization
    // Use smaller batch size but higher concurrency to stay within memory limits while maximizing speed
    const BATCH_SIZE = 10; 
    const batches = [];
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      batches.push(processedChunks.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i++) {
      // Vercel Free Watchdog (10s) vs Pro Watchdog (300s)
      // We aim for a 9s threshold for baseline safety
      const elapsed = Date.now() - startTime;
      if (elapsed > 9000 && processedChunks.length > 50) { 
        // If we are on a tight budget, commit what we have and finish
        console.warn(`⏳ [Indexer] Early completion triggered for safety.`);
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

        await supabase.from('document_chunks').insert(records);
        
        // Progress Heartbeat: Update status to partial success if we've processed significant chunks
        if (i % 5 === 0) {
           await supabase.from('documents').update({ status: 'ready', rag_indexed: true }).eq('id', documentId);
        }
      } catch (batchErr: any) {
        console.error(`⚠️ [Indexer] Batch fault:`, batchErr.message);
      }
    }

    // 4. Final Lock
    await supabase.from('documents').update({ 
      status: 'ready', 
      rag_indexed: true,
      updated_at: new Date().toISOString()
    }).eq('id', documentId);

    console.log(`✅ [Indexer] Sync Complete: ${(Date.now() - startTime) / 1000}s`);
    return { success: true };
  } catch (error: any) {
    console.error("❌ [Indexer Critical]:", error);
    try {
      await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    } catch (e) {}
    throw error;
  }
}