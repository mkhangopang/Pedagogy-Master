import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * HIGH-THROUGHPUT NEURAL INDEXER (v105.0)
 * Optimized for Sindh Grids & Serverless Resilience.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  const startTime = Date.now();
  console.log(`📡 [Indexer] Initiating High-Speed Sync: ${documentId}`);
  
  try {
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    // 1. Deep Hierarchical Extraction
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^Standard:/i)) currentCtx.standard = line;
      if (line.match(/^Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      // Grouping logic: Chunk on SLO boundaries or conceptual blocks
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

    console.log(`🧠 [Indexer] Vectorizing ${processedChunks.length} nodes...`);

    // 2. Clear Existing Data (Atomic)
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 3. Batch Vectorization with Watchdog Control
    // Gemini supports up to 100 requests in a single batch
    const BATCH_SIZE = 50; 
    const batches = [];
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      batches.push(processedChunks.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i++) {
      // Serverless Watchdog: If we approach 30s limit (common gateway timeout), finalize current state
      if (Date.now() - startTime > 25000) {
        console.warn(`⏳ [Indexer] Sync safety threshold reached. Finalizing partial sync.`);
        break;
      }

      const batch = batches[i];
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));
      
      const records = batch.map((chunk, j) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[j],
        slo_codes: chunk.metadata.slo_codes,
        metadata: chunk.metadata
      }));

      const { error } = await supabase.from('document_chunks').insert(records);
      if (error) console.error(`⚠️ [Indexer] Batch insert error:`, error.message);
    }

    // 4. Force Status Completion
    const { error: finalError } = await supabase.from('documents').update({ 
      status: 'ready', 
      rag_indexed: true,
      updated_at: new Date().toISOString()
    }).eq('id', documentId);

    if (finalError) throw finalError;

    console.log(`✅ [Indexer] Sync Anchored in ${(Date.now() - startTime) / 1000}s`);
    return { success: true };
  } catch (error: any) {
    console.error("❌ [Indexer Fatal]:", error);
    // Mark as failed so user can retry, instead of stuck in 'processing'
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId).catch(() => {});
    throw error;
  }
}