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

export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  try {
    console.log(`📡 [Neural Indexer] Commencing Deep Hierarchical Audit: ${documentId}`);
    
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    // Iterate lines to maintain hierarchical state during chunking
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Update Context Markers
      if (line.match(/^DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^Standard:/i)) currentCtx.standard = line;
      if (line.match(/^Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      // When we hit a new SLO, or every 10 lines of general text, create a chunk
      if (line.match(/^- SLO:/i) || i === lines.length - 1) {
        if (buffer.length > 50) {
          const sloMatches = buffer.match(/S-\d{1,2}-[A-Z]-\d{1,2}/gi) || [];
          const normalizedSLOs = sloMatches.map(c => normalizeSLO(c));

          processedChunks.push({
            text: buffer.trim(),
            metadata: {
              ...currentCtx,
              slo_codes: normalizedSLOs,
              is_slo_definition: buffer.includes('- SLO:'),
              chunk_index: processedChunks.length
            }
          });
        }
        buffer = line + "\n";
      } else {
        buffer += line + "\n";
      }
    }

    console.log(`🧠 [Neural Indexer] Vectorizing ${processedChunks.length} curriculum nodes...`);

    // Batch Vectorization (Optimized for Grid Performance)
    const BATCH_SIZE = 12;
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      const batch = processedChunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));

      const records = batch.map((chunk, j) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[j],
        slo_codes: chunk.metadata.slo_codes,
        metadata: chunk.metadata
      }));

      if (i === 0) await supabase.from('document_chunks').delete().eq('document_id', documentId);
      
      const { error } = await supabase.from('document_chunks').insert(records);
      if (error) throw error;
    }

    await supabase.from('documents').update({ status: 'ready', rag_indexed: true }).eq('id', documentId);
    return { success: true };
  } catch (error) {
    console.error("❌ [Indexer Fault]:", error);
    throw error;
  }
}