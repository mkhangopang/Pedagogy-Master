import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

export { extractSLOCodes };

export interface RetrievedChunk {
  chunk_id: string;
  chunk_text: string;
  slo_codes: string[];
  page_number: number | null;
  section_title: string | null;
  combined_score: number | null;
}

/**
 * HIGH-PRECISION RAG RETRIEVER (v26.0)
 * Optimized for SLO extraction and explicit boosting.
 */
export async function retrieveRelevantChunks({
  query,
  documentId,
  supabase,
  matchCount = 5
}: {
  query: string;
  documentId: string;
  supabase: SupabaseClient;
  matchCount?: number;
}): Promise<RetrievedChunk[]> {
  try {
    // Step 1: Extract Unique SLO Codes from User Query
    const extractedSLOs = extractSLOCodes(query);
    console.log('🎯 User query:', query);
    console.log('📝 Extracted SLO codes:', extractedSLOs);
    
    // Step 2: Generate Vector Embedding (text-embedding-004)
    const queryEmbedding = await generateEmbedding(query);
    
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      console.error('❌ [Retriever] Vector synthesis failed or dimension mismatch (768 req).');
      return [];
    }
    
    console.log('✅ Query embedding generated (768 dimensions)');

    // Step 3: Call Supabase RPC with CORRECT parameters (Fix 2)
    // hybrid_search_chunks_v2(query_embedding, match_count, filter_document_ids, priority_document_id, boost_tags)
    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v2', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: [documentId],      // ✅ MUST be array
      priority_document_id: documentId,        // ✅ Boost this document
      boost_tags: extractedSLOs.length > 0 ? extractedSLOs : []  // ✅ Boost matching SLO codes
    });
    
    if (error) {
      console.error('❌ Supabase RPC error:', error.message);
      console.error('Parameters used:', {
        match_count: matchCount,
        filter_document_ids: [documentId],
        boost_tags: extractedSLOs
      });
      return [];
    }
    
    console.log('✅ Retrieved chunks:', chunks?.length || 0);
    
    if (chunks && chunks.length > 0) {
      console.log('📚 Sample chunk SLOs:', chunks[0].slo_codes);
      const matchedSLOs = chunks.filter((c: any) => 
        c.slo_codes?.some((code: string) => extractedSLOs.includes(code))
      ).length;
      console.log('🎯 Chunks matching query SLOs:', matchedSLOs);
    } else {
      console.warn('⚠️ No chunks retrieved for query:', query);
    }
    
    return (chunks || []).map((d: any) => ({
      chunk_id: d.chunk_id,
      chunk_text: d.chunk_text,
      slo_codes: d.slo_codes || [],
      page_number: d.page_number,
      section_title: d.section_title,
      combined_score: d.combined_score
    }));
    
  } catch (err) {
    console.error('❌ Retrieval error:', err);
    return [];
  }
}