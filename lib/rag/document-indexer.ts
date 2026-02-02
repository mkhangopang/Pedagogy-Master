import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * WORLD-CLASS NEURAL INDEXER (v170.0)
 * SLO-Atomic Mode: Forces breaks at tags to prevent 'Context Dilution'.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient,
  preExtractedMeta?: any
) {
  console.log(`📡 [Indexer] SLO-Atomic Ingestion Initiated: ${documentId}`);
  
  try {
    const meta = preExtractedMeta || {};
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    // Pattern handles SLO, SL0, and standard Sindh bracket format
    const ANCHOR_PATTERN = /(?:- SL[O0][:\s]*|\[SL[O0][:\s]*)|(?:^|\s)([B-Z]\d{1,2}(?:\.|-)?(?:p|P|[A-Z])?-?\d{1,2})\b/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Update contextual hierarchy
      if (line.match(/^\s*DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^\s*Standard:/i)) currentCtx.standard = line;
      if (line.match(/^\s*Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      const isSloAnchor = line.match(ANCHOR_PATTERN);
      const isHeaderAnchor = line.match(/^#{1,3}\s+/) || line.match(/^\s*(?:DOMAIN|Standard|Benchmark)/i);
      
      // LOGIC: If we find an SLO tag, we MUST break the previous chunk to keep this SLO clean.
      // Or if the buffer is just getting too huge.
      const shouldBreak = (isSloAnchor && buffer.length > 50) || (isHeaderAnchor && buffer.length > 800) || buffer.length > 2500;

      if (shouldBreak) {
        const normalizedSLOs = extractSLOCodes(buffer);

        processedChunks.push({
          text: buffer.trim(),
          metadata: {
            ...currentCtx,
            subject: meta.subject,
            grade: meta.grade,
            slo_codes: normalizedSLOs,
            is_slo_definition: normalizedSLOs.length > 0,
            chunk_index: processedChunks.length,
            source_path: filePath
          }
        });
        buffer = line + "\n";
      } else {
        buffer += line + "\n";
      }
    }

    // Process remainder
    if (buffer.trim().length > 10) {
      const normalizedSLOs = extractSLOCodes(buffer);
      processedChunks.push({
        text: buffer.trim(),
        metadata: { ...currentCtx, slo_codes: normalizedSLOs, chunk_index: processedChunks.length, source_path: filePath }
      });
    }

    // Atomic Sync
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    const BATCH_SIZE = 20; 
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

    await supabase.from('documents').update({ 
      rag_indexed: true,
      last_synced_at: new Date().toISOString()
    }).eq('id', documentId);

    return { success: true, count: processedChunks.length };
  } catch (error: any) {
    console.error("❌ [Indexer SLO-Atomic Fault]:", error);
    throw error;
  }
}