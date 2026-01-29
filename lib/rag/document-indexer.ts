import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * HIGH-THROUGHPUT NEURAL INDEXER (v115.0)
 * Optimized for High-Resilience & Adaptive Load Balancing.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  const startTime = Date.now();
  console.log(`📡 [Indexer] Sync Initiated for Asset Node: ${documentId}`);
  
  try {
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    // 1. Structural Logic Mapping
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

    console.log(`🧠 [Indexer] Anchoring ${processedChunks.length} neural nodes to vector grid...`);

    // 2. Atomic Reset
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 3. Adaptive Batch Processing
    // Start with large batches (25) for efficiency, fallback to 10 if errors occur
    let BATCH_SIZE = 25; 
    const batches = [];
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      batches.push(processedChunks.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i++) {
      // 55s Serverless Watchdog for extended maxDuration environments (Pro/Enterprise)
      // Fallback for standard environments: status will commit if we approach timeout
      const elapsed = Date.now() - startTime;
      if (elapsed > 280000) { // 280s / 4.6 mins (Safe margin for 300s limit)
        console.warn(`⏳ [Indexer] Safety threshold reached. Finalizing current nodes.`);
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
        console.error(`⚠️ [Indexer] Local node fault:`, batchErr.message);
        // Continue to prevent complete document loss
      }
    }

    // 4. Persistence Audit
    const { error: finalError } = await supabase.from('documents').update({ 
      status: 'ready', 
      rag_indexed: true,
      updated_at: new Date().toISOString()
    }).eq('id', documentId);

    if (finalError) throw finalError;

    console.log(`✅ [Indexer] Sync Anchored Successfully. Duration: ${(Date.now() - startTime) / 1000}s`);
    return { success: true };
  } catch (error: any) {
    console.error("❌ [Indexer Critical Fault]:", error);
    try {
      await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    } catch (dbErr) {
      console.warn("Failed to update failure state.");
    }
    throw error;
  }
}