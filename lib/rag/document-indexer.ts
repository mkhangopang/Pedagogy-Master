import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * WORLD-CLASS NEURAL INDEXER (v164.0)
 * Optimized for SLO-Centric Retrieval & Hierarchical Boundary Analysis.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient,
  preExtractedMeta?: any
) {
  const startTime = Date.now();
  console.log(`📡 [Indexer] Initiating Precision Ingestion: ${documentId}`);
  
  try {
    const meta = preExtractedMeta || {};
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    // 1. DYNAMIC ANCHOR DETECTION
    // Synchronized with slo-extractor.ts for unified pattern recognition
    const ANCHOR_PATTERN = /(?:- SLO[:\s]*|\[SLO:\s*)|(?:^|\s)([B-Z]\d{1,2}(?:\.|-)?(?:p|P|[A-Z])?-?\d{1,2})\b/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.match(/^DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^Standard:/i)) currentCtx.standard = line;
      if (line.match(/^Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      // Detect semantic breaks (New SLO, New Header, or Page Markers)
      const isAnchor = line.match(ANCHOR_PATTERN) || line.match(/^#{1,3}\s+/);

      if (isAnchor && buffer.length > 50) {
        // Finalize current chunk before starting new one
        const sloMatches = buffer.match(/([B-Z]-?\d{2}-?[A-Z]-?\d{2})|([S]-?\d{2}-?[A-Z]-?\d{2})|([B-Z]\d{1,2}[\.pP-]?\d{1,2})/gi) || [];
        const normalizedSLOs = Array.from(new Set(sloMatches.map(c => normalizeSLO(c))));

        processedChunks.push({
          text: buffer.trim(),
          metadata: {
            ...currentCtx,
            subject: meta.subject,
            grade: meta.grade,
            board: meta.board,
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

    // 2. TAIL BUFFER PROCESSING
    if (buffer.trim().length > 20) {
      const sloMatches = buffer.match(/([B-Z]\d{1,2}[\.pP-]?\d{1,2})/gi) || [];
      const normalizedSLOs = Array.from(new Set(sloMatches.map(c => normalizeSLO(c))));
      processedChunks.push({
        text: buffer.trim(),
        metadata: { ...currentCtx, slo_codes: normalizedSLOs, chunk_index: processedChunks.length, source_path: filePath }
      });
    }

    // 3. RECURSIVE CHUNK REFINEMENT (If too few chunks found)
    if (processedChunks.length < 5 && content.length > 1000) {
      const words = content.split(/\s+/);
      const chunkSize = 500;
      for (let i = 0; i < words.length; i += 400) {
        const chunkText = words.slice(i, i + chunkSize).join(' ');
        processedChunks.push({
          text: `[CONCEPTUAL_NODE] ${chunkText}`,
          metadata: { type: 'fallback', chunk_index: processedChunks.length, source_path: filePath }
        });
      }
    }

    // 4. VECTOR CLUSTER SYNCHRONIZATION
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
      
      // Safety cooling to prevent 429 during heavy ingest
      if (processedChunks.length > 50) await new Promise(r => setTimeout(r, 100));
    }

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
