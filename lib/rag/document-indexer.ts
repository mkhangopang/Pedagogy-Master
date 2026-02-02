import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * WORLD-CLASS NEURAL INDEXER (v185.0)
 * SLO-Atomic Structural Mode: Prioritizes logical curriculum breaks over character counts.
 * Designed to prevent "Standard Dilution" in high-stakes RAG.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient,
  preExtractedMeta?: any
) {
  console.log(`📡 [Indexer] Structural Ingestion Initiated: ${documentId}`);
  
  try {
    const meta = preExtractedMeta || {};
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    // Comprehensive Anchor Detection for Sindh, Federal, and International formats
    const ANCHOR_PATTERN = /(?:- SL[O0][:\s]*|\[SL[O0][:\s]*)|(?:^|\s)([B-S]\s?-?\s?\d{1,2}\s?-?\s?[A-Z]\s?-?\s?\d{1,2})\b/i;
    const HEADER_PATTERN = /^#{1,4}\s+|^DOMAIN\s+[A-Z]:|^Standard:|^Benchmark\s+\d+:/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Hierarchy Tracking
      if (line.match(/^#+\s+DOMAIN\s+([A-Z]):/i)) currentCtx.domain = line;
      if (line.match(/^#+\s+Standard:/i)) currentCtx.standard = line;
      if (line.match(/^#+\s+Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      const isSloAnchor = !!line.match(ANCHOR_PATTERN);
      const isHeaderBreak = !!line.match(HEADER_PATTERN);
      
      /**
       * ADAPTIVE BREAK LOGIC:
       * 1. Force break at any new SLO if the buffer has content (Atomicity).
       * 2. Break at headers if buffer is > 500 chars (Hierarchy).
       * 3. Safety break at 3000 chars (Context Window protection).
       */
      const shouldBreak = 
        (isSloAnchor && buffer.length > 100) || 
        (isHeaderBreak && buffer.length > 500) || 
        buffer.length > 3000;

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
            source_path: filePath,
            curriculum_dna: meta.curriculum_name || 'Autonomous'
          }
        });
        buffer = line + "\n";
      } else {
        buffer += line + "\n";
      }
    }

    // Capture final buffer
    if (buffer.trim().length > 10) {
      const normalizedSLOs = extractSLOCodes(buffer);
      processedChunks.push({
        text: buffer.trim(),
        metadata: { 
          ...currentCtx, 
          slo_codes: normalizedSLOs, 
          chunk_index: processedChunks.length, 
          source_path: filePath 
        }
      });
    }

    // Sync Vector Store
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // Batching with 768-dim strictly enforced
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

    await supabase.from('documents').update({ 
      rag_indexed: true,
      last_synced_at: new Date().toISOString()
    }).eq('id', documentId);

    return { success: true, count: processedChunks.length };
  } catch (error: any) {
    console.error("❌ [Indexer Adaptive Fault]:", error);
    throw error;
  }
}