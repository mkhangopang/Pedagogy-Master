import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '../supabase';
import { chunkDocument } from './chunking-strategy';
import { generateEmbeddingsBatch } from './embeddings';
import { fetchDocumentFromR2, fetchAndExtractPDF } from '../storage/r2-client';

/**
 * NEURAL RAG INDEXER
 * Orchestrates the conversion of curriculum assets into a searchable vector grid.
 * Handles content retrieval, semantic chunking, and batch embedding.
 */
export async function indexDocumentForRAG(
  documentId: string,
  content: string | null,
  r2Key: string | null,
  supabase: SupabaseClient = defaultSupabase
): Promise<void> {
  console.log(`\n🔍 [RAG Indexer] Starting indexing for: ${documentId}`);
  
  try {
    // 1. Content Acquisition
    let documentText = content || "";
    
    // Resolve content from storage if not provided in-memory
    if (!documentText && r2Key && typeof r2Key === 'string') {
      console.log(`📥 [RAG Indexer] Fetching from storage: ${r2Key}`);
      try {
        if (r2Key.toLowerCase().endsWith('.pdf')) {
          documentText = await fetchAndExtractPDF(r2Key);
        } else {
          documentText = await fetchDocumentFromR2(r2Key);
        }
      } catch (fetchErr) {
        console.warn(`⚠️ [RAG Indexer] Storage fetch failed. Fallback to database...`, fetchErr);
      }
    }
    
    // Database Fallback
    if (!documentText) {
      const { data: doc } = await supabase
        .from('documents')
        .select('extracted_text')
        .eq('id', documentId)
        .single();
      documentText = doc?.extracted_text || "";
    }

    if (!documentText || documentText.trim().length === 0) {
      throw new Error('No indexable curriculum content discovered.');
    }
    
    console.log(`✅ [RAG Indexer] Content resolved (${documentText.length} chars)`);
    
    // 2. Semantic Pedagogical Chunking
    const chunks = chunkDocument(documentText);
    if (chunks.length === 0) {
      console.warn(`⚠️ [RAG Indexer] Zero semantic nodes generated. Finalizing lifecycle...`);
      await supabase.from('documents').update({ status: 'ready', gemini_processed: true }).eq('id', documentId);
      return;
    }
    console.log(`📦 [RAG Indexer] Generated ${chunks.length} neural segments.`);
    
    // 3. Vectorization (text-embedding-004)
    const chunkTexts = chunks.map(c => c.text);
    console.log(`🧠 [RAG Indexer] Embedding via Gemini synthesis node...`);
    const embeddings = await generateEmbeddingsBatch(chunkTexts);
    
    // 4. Persistence to Vector Store
    console.log(`💾 [RAG Indexer] Committing segments to vector plane...`);
    
    const insertPayload = chunks.map((chunk, idx) => ({
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
    
    // Clear legacy vectors for this document
    const { error: deleteError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    if (deleteError) throw deleteError;

    // Execute atomic batch insertion
    const batchSize = 50;
    for (let i = 0; i < insertPayload.length; i += batchSize) {
      const batch = insertPayload.slice(i, i + batchSize);
      const { error: insertError } = await supabase.from('document_chunks').insert(batch);
      if (insertError) throw insertError;
    }
    
    // 5. Lifecycle Status Synchronization
    await supabase
      .from('documents')
      .update({
        status: 'ready',
        gemini_processed: true,
        gemini_processed_at: new Date().toISOString()
      })
      .eq('id', documentId);
    
    console.log(`✅ [RAG Indexer] Neural synchronization complete for ${documentId}.\n`);
    
  } catch (error: any) {
    console.error(`❌ [RAG Indexer] Synthesis Interrupted:`, error);
    await supabase.from('documents').update({ 
      status: 'failed',
      gemini_processed: false 
    }).eq('id', documentId);
    throw error;
  }
}
