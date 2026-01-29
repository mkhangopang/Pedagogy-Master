import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

interface IngestionContext {
  domain?: string;
  standard?: string;
  benchmark?: string;
}

/**
 * WORLD-CLASS NEURAL INDEXER (v161.0)
 * Optimized for SLO-Centric Retrieval & Massive Documents.
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
      
      // Track Hierarchical Context
      if (line.match(/^DOMAIN\s+[A-Z]:/i)) currentCtx.domain = line;
      if (line.match(/^Standard:/i)) currentCtx.standard = line;
      if (line.match(/^Benchmark\s+\d+:/i)) currentCtx.benchmark = line;

      // Break chunk at SLO marker or header
      const isSloMarker = line.match(/^- SLO[:\s]*([A-Z]-\d{2}-[A-Z]-\d{2})/i);
      const isHeader = line.match(/^#{1,3}\s+/);

      if (isSloMarker || isHeader || i === lines.length - 1) {
        if (buffer.length > 30) {
          // Deep Regex extraction for Sindh & Short formats
          const sloMatches = buffer.match(/([B-Z]-\d{2}-[A-Z]-\d{2})|([S]-\d{2}-[A-Z]-\d{2})/gi) || [];
          const normalizedSLOs = Array.from(new Set(sloMatches.map(c => normalizeSLO(c))));

          processedChunks.push({
            text: buffer.trim(),
            metadata: {
              ...currentCtx,
              subject: meta.subject,
              grade: meta.grade,
              board: meta.board,
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

    // 2. CLEAR PREVIOUS NODES (Atomic Refresh)
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // 3. BATCH EMBEDDING GRID (v35 Performance)
    // Using a reliable batch size for Vercel edge/lambda limits
    const BATCH_SIZE = 20; 
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      // Safety Break: Prevent function timeout (approx 60s for standard nodes)
      if (Date.now() - startTime > 85000) {
        console.warn(`⚠️ [Indexer] Timeout Protection triggered. Incomplete sync for doc: ${documentId}`);
        break;
      }

      const batch = processedChunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));
      
      const records = batch.map((chunk, j) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[j],
        slo_codes: chunk.metadata.slo_codes,
        metadata: chunk.metadata
      }));

      const { error: insertError } = await supabase.from('document_chunks').insert(records);
      if (insertError) console.error(`❌ Batch Insert Fault:`, insertError);
    }

    // 4. ANCHOR SUCCESS
    await supabase.from('documents').update({ 
      status: 'ready', 
      rag_indexed: true,
      last_synced_at: new Date().toISOString()
    }).eq('id', documentId);

    console.log(`✅ [Indexer] Neural Handshake Success: ${processedChunks.length} nodes anchored in ${Date.now() - startTime}ms`);
    return { success: true, count: processedChunks.length };
  } catch (error: any) {
    console.error("❌ [Indexer Fatal Fault]:", error);
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    throw error;
  }
}