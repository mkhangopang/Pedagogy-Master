import { SupabaseClient } from '@supabase/supabase-js';
import { chunkDocument } from './chunking-strategy';
import { generateEmbeddingsBatch } from './embeddings';

/**
 * NEURAL RAG INDEXER
 * Transforms raw text into a searchable vector graph.
 */
export async function indexDocumentForRAG(
  documentId: string,
  documentText: string,
  supabase: SupabaseClient
): Promise<void> {
  console.log(`[RAG Indexer] Initiating deep audit for Document: ${documentId}`);
  
  try {
    // 1. Semantic Splitting
    const chunks = chunkDocument(documentText);
    if (chunks.length === 0) return;

    // 2. Multi-Model Embedding
    const texts = chunks.map(c => c.text);
    const vectors = await generateEmbeddingsBatch(texts);

    // 3. Vector Persistence
    const insertPayload = chunks.map((chunk, i) => ({
      document_id: documentId,
      chunk_text: chunk.text,
      chunk_index: i,
      chunk_type: chunk.type,
      slo_codes: chunk.sloMentioned,
      keywords: chunk.keywords,
      embedding: vectors[i],
      semantic_density: chunk.semanticDensity
    }));

    // Batch insert for database stability
    const { error } = await supabase
      .from('document_chunks')
      .insert(insertPayload);

    if (error) throw error;

    // 4. Update Mastery Metadata
    await supabase
      .from('documents')
      .update({ 
        gemini_processed: true, 
        status: 'ready' 
      })
      .eq('id', documentId);

    console.log(`[RAG Indexer] ${chunks.length} nodes successfully indexed.`);
  } catch (err) {
    console.error(`[RAG Indexer Failure]`, err);
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
  }
}
