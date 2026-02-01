import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * WORLD-CLASS NEURAL INDEXER (v163.0)
 * Optimized for SLO-Centric Retrieval & Conceptual Fallback.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient,
  preExtractedMeta?: any
) {
  const startTime = Date.now();
  console.log(`📡 [Indexer] Ingesting Neural Nodes for document: ${documentId}`);
  
  try {
    const meta = preExtractedMeta || {};
    const lines = content.split('\n');
    const processedChunks: any[] = [];
    let currentCtx: IngestionContext = {};
    let buffer = "";

    // 1. ADAPTIVE SLO-AWARE CHUNKING
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.match(/^DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^Standard:/i)) currentCtx.standard = line;
      if (line.match(/^Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      // Sindh & Federal SLO Pattern Matching
      const isSloMarker = line.match(/^- SLO[:\s]*([A-Z]-?\d{2}-?[A-Z]-?\d{2})/i) || line.match(/\[SLO:.*?\]/i);
      const isHeader = line.match(/^#{1,3}\s+/);

      if (isSloMarker || isHeader || i === lines.length - 1) {
        if (buffer.length > 30) {
          const sloMatches = buffer.match(/([B-Z]-?\d{2}-?[A-Z]-?\d{2})|([S]-?\d{2}-?[A-Z]-?\d{2})|([B-Z]\d{1,2}\.p\d{1,2})/gi) || [];
          const normalizedSLOs = Array.from(new Set(sloMatches.map(c => normalizeSLO(c))));

          processedChunks.push({
            text: buffer.trim(),
            metadata: {
              ...currentCtx,
              subject: meta.subject,
              grade: meta.grade,
              board: meta.board,
              slo_codes: normalizedSLOs,
              is_slo_definition: buffer.includes('- SLO:') || buffer.includes('[SLO:'),
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

    // 2. CONCEPTUAL FALLBACK (If document had no strict markers)
    if (processedChunks.length < 5 && content.length > 1000) {
      console.log("🧩 [Indexer] Insufficient semantic markers found. Engaging Conceptual Fallback Chunking...");
      const words = content.split(/\s+/);
      const chunkSize = 400;
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkText = words.slice(i, i + chunkSize).join(' ');
        if (chunkText.length > 100) {
          processedChunks.push({
            text: `[CONCEPTUAL_NODE] ${chunkText}`,
            metadata: {
              type: 'fallback',
              chunk_index: processedChunks.length,
              source_path: filePath
            }
          });
        }
      }
    }

    // 3. CLEAR PREVIOUS NODES
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 4. BATCH EMBEDDING GRID
    const BATCH_SIZE = 10; 
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > 85000) { // 85s safe limit
        console.warn(`⚠️ [Indexer] Timeout protection engaged at ${i}/${processedChunks.length} chunks.`);
        break;
      }

      const batch = processedChunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));
      
      const records = batch.map((chunk, j) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[j],
        slo_codes: chunk.metadata.slo_codes || [],
        metadata: chunk.metadata
      }));

      const { error: insertError } = await supabase.from('document_chunks').insert(records);
      if (insertError) throw new Error(`Vector Insert Fault: ${insertError.message}`);
    }

    // 5. MARK AS INDEXED
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
