import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';
import { normalizeSLO } from './slo-extractor';

/**
 * PEDAGOGICAL METADATA EXTRACTOR
 */
function extractBlockMetadata(text: string) {
  const grades = new Set<string>();
  
  // 1. Extract Grade Numbers (4, 5, 6, 7, 8)
  const gradeMatches = text.match(/(?:Grade|Class|Level|S-)\s*(\d{1,2})/gi);
  if (gradeMatches) {
    gradeMatches.forEach(m => {
      const num = m.match(/\d+/);
      if (num) grades.add(parseInt(num[0], 10).toString());
    });
  }

  // 2. Identify SLO Codes in the chunk
  const sloPattern = /S-\d{1,2}-[A-Z]-\d{1,2}/gi;
  const sloMatches = text.match(sloPattern) || [];
  const normalizedSLOs = sloMatches.map(c => normalizeSLO(c));

  return {
    grade_levels: Array.from(grades),
    slo_codes: normalizedSLOs,
    is_slo_definition: text.includes('SLO:')
  };
}

export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  try {
    console.log(`📡 [Neural Indexer] Atomic Sync for Doc: ${documentId}`);
    
    // CRITICAL: Split by SLO marker so every objective is its own searchable node
    const blocks = content.split(/(?=- SLO:)/g);
    const processedChunks: any[] = [];

    blocks.forEach((block, index) => {
      const text = block.trim();
      if (text.length < 10) return;

      const meta = extractBlockMetadata(text);
      
      processedChunks.push({
        text,
        sloCodes: meta.slo_codes,
        metadata: { ...meta, chunk_index: index }
      });
    });

    // Batch process embeddings to stay within rate limits
    const BATCH_SIZE = 15;
    for (let i = 0; i < processedChunks.length; i += BATCH_SIZE) {
      const batch = processedChunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.text));

      const records = batch.map((chunk, j) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[j],
        slo_codes: chunk.sloCodes, // This is the ' overlaps ' target
        grade_levels: chunk.metadata.grade_levels,
        metadata: chunk.metadata
      }));

      // On first batch, clear old indices for this doc
      if (i === 0) await supabase.from('document_chunks').delete().eq('document_id', documentId);
      
      const { error } = await supabase.from('document_chunks').insert(records);
      if (error) throw error;
    }

    await supabase.from('documents').update({ status: 'ready', rag_indexed: true }).eq('id', documentId);
    return { success: true };
  } catch (error) {
    console.error("Indexer Fatal Error:", error);
    throw error;
  }
}
