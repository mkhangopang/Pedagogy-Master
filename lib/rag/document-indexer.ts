import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '../supabase';
import { chunkDocument } from './chunking-strategy';
import { generateEmbeddingsBatch } from './embeddings';
import { fetchDocumentFromR2, fetchAndExtractPDF } from '../storage/r2-client';

/**
 * INDEX DOCUMENT FOR RAG - WITH R2 FETCH
 * This function handles the end-to-end flow: Retrieval -> Chunking -> Embedding -> Storage.
 */
export async function indexDocumentForRAG(
  documentId: string,
  r2Key: string | null,
  supabase: SupabaseClient = defaultSupabase,
  metadata?: { filename: string; subject?: string; grade?: string }
): Promise<void> {
  
  console.log(`\n🔍 [RAG Indexer] Starting indexing for: ${documentId}`);
  
  try {
    // 1. Fetch document content
    let documentText = "";
    
    // If r2Key is provided, fetch fresh content; otherwise check if text is passed directly
    if (r2Key) {
      if (r2Key.endsWith('.pdf')) {
        documentText = await fetchAndExtractPDF(r2Key);
      } else {
        documentText = await fetchDocumentFromR2(r2Key);
      }
    } else {
      // Fallback: check database for existing text
      const { data: doc } = await supabase.from('documents').select('extracted_text').eq('id', documentId).single();
      documentText = doc?.extracted_text || "";
    }
    
    if (!documentText || documentText.trim().length === 0) {
      throw new Error('No indexable text content available.');
    }
    
    console.log(`✅ [RAG Indexer] Content retrieved (${documentText.length} chars)`);
    
    // 2. Chunk document semantically
    const chunks = chunkDocument(documentText);
    console.log(`✅ [RAG Indexer] Created ${chunks.length} chunks`);
    
    // 3. Generate embeddings for all chunks
    const chunkTexts = chunks.map(c => c.text);
    console.log(`🧠 [RAG Indexer] Generating embeddings...`);
    const embeddings = await generateEmbeddingsBatch(chunkTexts);
    console.log(`✅ [RAG Indexer] Generated ${embeddings.length} embeddings`);
    
    // 4. Save chunks to database
    console.log(`💾 [RAG Indexer] Saving chunks to Supabase...`);
    
    const insertData = chunks.map((chunk, idx) => ({
      document_id: documentId,
      chunk_text: chunk.text,
      chunk_index: idx,
      chunk_type: chunk.type,
      slo_codes: chunk.sloMentioned || [],
      keywords: chunk.keywords,
      embedding: embeddings[idx],
      page_number: chunk.pageNumber,
      section_title: chunk.sectionTitle,
      semantic_density: chunk.semanticDensity
    }));
    
    // Atomically clear old chunks if any
    await supabase.from('document_chunks').delete().eq('document_id', documentId);

    // Insert in batches for performance and stability
    const batchSize = 50;
    for (let i = 0; i < insertData.length; i += batchSize) {
      const batch = insertData.slice(i, i + batchSize);
      const { error } = await supabase.from('document_chunks').insert(batch);
      if (error) throw error;
    }
    
    // 5. Update document status
    await supabase
      .from('documents')
      .update({
        status: 'ready',
        gemini_processed: true,
        gemini_processed_at: new Date().toISOString()
      })
      .eq('id', documentId);
    
    console.log(`✅ [RAG Indexer] Indexing complete for: ${documentId}\n`);
    
  } catch (error) {
    console.error(`❌ [RAG Indexer] Indexing failed:`, error);
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
    throw error;
  }
}
