import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '../supabase';
import { chunkDocument } from './chunking-strategy';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * RAG INDEXER (NEURAL EDITION)
 * One-time processing of curriculum assets into a permanent vector grid.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string | null,
  r2Key: string | null,
  supabase: SupabaseClient = defaultSupabase
): Promise<void> {
  console.log(`\n🧠 [Neural Indexer] Commencing sync for document: ${documentId}`);
  
  try {
    let documentText = content || "";
    
    // Fallback: Fetch content if not provided (essential for re-indexing existing docs)
    if (!documentText) {
      const { data: doc } = await supabase
        .from('documents')
        .select('extracted_text')
        .eq('id', documentId)
        .single();
      documentText = doc?.extracted_text || "";
    }

    if (!documentText || documentText.length < 50) {
      throw new Error('Insufficient text discovered for neural indexing.');
    }
    
    // 1. Structural Chunking
    const chunks = chunkDocument(documentText);
    console.log(`✅ [Indexer] Generated ${chunks.length} pedagogical chunks.`);
    
    // 2. Neural Vector Synthesis
    console.log(`✨ [Indexer] Synthesizing neural embeddings...`);
    const chunkTexts = chunks.map(c => c.text);
    const embeddings = await generateEmbeddingsBatch(chunkTexts);
    console.log(`✅ [Indexer] Embeddings generated successfully.`);

    // 3. Persistent Storage Update (CLEANUP BEFORE INSERT)
    // This ensures re-indexing old documents doesn't double the context
    await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    const insertData = chunks.map((chunk, idx) => ({
      document_id: documentId,
      chunk_text: chunk.text,
      chunk_index: chunk.index,
      chunk_type: chunk.type,
      slo_codes: chunk.sloMentioned,
      keywords: chunk.keywords,
      embedding: embeddings[idx]
    }));
    
    // Insert in batches to prevent payload limits
    const batchSize = 25;
    for (let i = 0; i < insertData.length; i += batchSize) {
      const batch = insertData.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('document_chunks')
        .insert(batch);
      
      if (insertError) throw insertError;
    }
    
    // 4. Finalize Status and Mark as Indexed
    await supabase
      .from('documents')
      .update({
        status: 'ready',
        rag_indexed: true,
        rag_indexed_at: new Date().toISOString(),
        chunk_count: chunks.length,
      })
      .eq('id', documentId);
    
    console.log(`🏁 [Neural Indexer] Indexing finalized for: ${documentId}`);
    
  } catch (error: any) {
    console.error(`❌ [Neural Indexer] Fatal error:`, error);
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    throw error;
  }
}
