import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * WORLD-CLASS NEURAL INDEXER (v20.0)
 */
export async function indexCurriculumMarkdown(
  documentId: string,
  content: string,
  supabase: SupabaseClient,
  metadata: any
) {
  if (!content || content.length < 50) throw new Error("Content too sparse.");

  try {
    const rawChunks: { text: string; sloCodes: string[] }[] = [];

    // 1. Structural Splitting
    const blocks = content.split(/(?=^(?:#{1,4}\s+)?(?:Standard:|Unit|Chapter|Section|SLO:))/gim);
    blocks.forEach((block) => {
      const trimmed = block.trim();
      if (trimmed.length < 20) return;

      const sloRegex = /(?:Standard:|SLO)\s*[:\s]*([A-Z0-9\.-]{2,15})/gi;
      const codes = Array.from(trimmed.matchAll(sloRegex))
        .map(m => m[1].trim().toUpperCase())
        .filter(c => c.length >= 2);
      
      rawChunks.push({
        text: trimmed,
        sloCodes: Array.from(new Set(codes))
      });
    });

    // 2. Sliding Window for general context
    const words = content.split(/\s+/);
    const windowSize = 400;
    const overlap = 150;
    for (let i = 0; i < words.length; i += (windowSize - overlap)) {
      const fragmentText = words.slice(i, i + windowSize).join(' ');
      if (fragmentText.length < 250) continue;
      rawChunks.push({ text: fragmentText, sloCodes: ['CONTEXT_NODE'] });
    }

    // 3. Batch Vector Synthesis
    const embeddings = await generateEmbeddingsBatch(rawChunks.map(c => c.text));

    const insertData = rawChunks.map((c, i) => ({
      document_id: documentId,
      chunk_text: c.text,
      embedding: embeddings[i],
      slo_codes: c.sloCodes,
      metadata: { board: metadata.board, subject: metadata.subject, processed_at: new Date().toISOString() },
      chunk_index: i
    }));

    // Reset and Sync
    await supabase.from('document_chunks').delete().eq('document_id', documentId);
    const { error: insertError } = await supabase.from('document_chunks').insert(insertData);
    if (insertError) throw insertError;

    // 4. ✅ COMMIT SUCCESS STATUS
    await supabase.from('documents').update({ rag_indexed: true, status: 'ready' }).eq('id', documentId);

    return rawChunks.length;
  } catch (err) {
    console.error('❌ Indexer Fatal:', err);
    await supabase.from('documents').update({ rag_indexed: false, status: 'failed' }).eq('id', documentId);
    throw err;
  }
}

export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string | undefined,
  supabase: SupabaseClient
) {
  const boardMatch = content.match(/Board:\s*([^\n\r]+)/i);
  const subjectMatch = content.match(/Subject:\s*([^\n\r]+)/i);
  return indexCurriculumMarkdown(documentId, content, supabase, { 
    board: boardMatch?.[1]?.trim(),
    subject: subjectMatch?.[1]?.trim()
  });
}