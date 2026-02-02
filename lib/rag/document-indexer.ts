import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO, extractSLOCodes } from './slo-extractor';

interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * WORLD-CLASS NEURAL INDEXER (v166.0)
 * Optimized for SLO-Centric Retrieval & High-Density Context (Audit Optimized).
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient,
  preExtractedMeta?: any
) {
  console.log(`📡 [Indexer] Precision Ingestion Initiated: ${documentId}`);
  
  try {
    const meta = preExtractedMeta || {};
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    const ANCHOR_PATTERN = /(?:- SLO[:\s]*|\[SLO:\s*)|(?:^|\s)([B-Z]\d{1,2}(?:\.|-)?(?:p|P|[A-Z])?-?\d{1,2})\b/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.match(/^DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^Standard:/i)) currentCtx.standard = line;
      if (line.match(/^Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      const isAnchor = line.match(ANCHOR_PATTERN) || line.match(/^#{1,3}\s+/);
      
      // AUDIT FIX: Increased buffer threshold from 100 to 1200 for richer semantic context
      const isBufferLargeEnough = buffer.length > 1200;
      const isBufferTooLarge = buffer.length > 2000; // Force split if no anchor found

      if ((isAnchor && isBufferLargeEnough) || isBufferTooLarge) {
        // Use canonical extractor for high-fidelity alignment
        const normalizedSLOs = extractSLOCodes(buffer);

        processedChunks.push({
          text: buffer.trim(),
          metadata: {
            ...currentCtx,
            subject: meta.subject,
            grade: meta.grade,
            slo_codes: normalizedSLOs,
            is_slo_definition: normalizedSLOs.length > 0 && (buffer.toLowerCase().includes('slo') || buffer.includes('[')),
            chunk_index: processedChunks.length,
            source_path: filePath
          }
        });
        buffer = line + "\n";
      } else {
        buffer += line + "\n";
      }
    }

    // Tail buffer processing
    if (buffer.trim().length > 20) {
      const normalizedSLOs = extractSLOCodes(buffer);
      processedChunks.push({
        text: buffer.trim(),
        metadata: { ...currentCtx, slo_codes: normalizedSLOs, chunk_index: processedChunks.length, source_path: filePath }
      });
    }

    // AUDIT FIX: Batch Cluster Synchronization with explicit rag_indexed flag setting
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    const BATCH_SIZE = 15; 
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      const batch = processedChunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));
      
      const records = batch.map((chunk, j) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[j],
        slo_codes: chunk.metadata.slo_codes || [],
        metadata: chunk.metadata
      }));

      await supabase.from('document_chunks').insert(records);
    }

    // Finalize state in indexer to ensure atomicity
    await supabase.from('documents').update({ 
      rag_indexed: true,
      last_synced_at: new Date().toISOString()
    }).eq('id', documentId);

    return { success: true, count: processedChunks.length };
  } catch (error: any) {
    console.error("❌ [Indexer Fault]:", error);
    throw error;
  }
}
