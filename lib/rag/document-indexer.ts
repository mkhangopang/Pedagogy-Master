import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * WORLD-CLASS NEURAL INDEXER (v22.0)
 * Synchronizes curriculum content with the vector search grid.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string,
  filePath: string,
  supabase: SupabaseClient
) {
  if (!content || content.length < 50) throw new Error("Content too sparse.");

  try {
    // 1. Initial State Lock
    await supabase.from('documents').update({ 
      status: 'processing', 
      rag_indexed: false 
    }).eq('id', documentId);

    const rawChunks: { text: string; sloCodes: string[] }[] = [];

    // 2. Structural Splitting Logic
    const blocks = content.split(/(?=^(?:#{1,4}\s+)?(?:Standard:|Unit|Chapter|Section|SLO:))/gim);
    
    blocks.forEach((block) => {
      const trimmed = block.trim();
      if (trimmed.length < 20) return;

      const sloRegex = /(?:Standard:|SLO)\s*[:\s]*([A-Z0-9\.-]{2,15})/gi;
      const codes: string[] = [];
      let match;
      while ((match = sloRegex.exec(trimmed)) !== null) {
        codes.push(match[1].toUpperCase().replace(/-/g, ''));
      }
      
      rawChunks.push({ text: trimmed, sloCodes: Array.from(new Set(codes)) });
    });

    // 3. Contextual Sliding Window (Fallback Coverage)
    if (rawChunks.length < 3) {
       const words = content.split(/\s+/);
       for (let i = 0; i < words.length; i += 300) {
         const slice = words.slice(i, i + 400).join(' ');
         if (slice.length > 100) rawChunks.push({ text: slice, sloCodes: [] });
       }
    }

    // 4. Batch Embedding Synthesis
    const texts = rawChunks.map(c => c.text);
    const embeddings = await generateEmbeddingsBatch(texts);

    // 5. Vector Grid Synchronization
    const chunkRecords = rawChunks.map((chunk, i) => ({
      document_id: documentId,
      chunk_text: chunk.text,
      embedding: embeddings[i],
      slo_codes: chunk.sloCodes,
      chunk_index: i
    }));

    // Reset local grid for this asset
    await supabase.from('document_chunks').delete().eq('document_id', documentId);
    
    if (chunkRecords.length > 0) {
      const { error: insertError } = await supabase.from('document_chunks').insert(chunkRecords);
      if (insertError) throw insertError;
    }

    // 6. Global Commit
    await supabase.from('documents').update({ 
      status: 'ready', 
      rag_indexed: true 
    }).eq('id', documentId);

    console.log(`✅ [Indexer] Synchronized ${chunkRecords.length} nodes for document ${documentId}`);

  } catch (error: any) {
    console.error("❌ [Indexer] Fatal Error:", error);
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    throw error;
  }
}