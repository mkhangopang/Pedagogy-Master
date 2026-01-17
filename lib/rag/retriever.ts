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
 * HIGH-PRECISION RAG RETRIEVER (v28.0)
 * Optimized for SLO extraction and deep context windowing.
 */
export async function retrieveRelevantChunks({
  query,
  documentIds, // Changed from single documentId to array
  supabase,
  matchCount = 25 // Increased default depth for broader curriculum visibility
}: {
  query: string;
  documentIds: string[];
  supabase: SupabaseClient;
  matchCount?: number;
}): Promise<RetrievedChunk[]> {
  try {
    if (!documentIds || documentIds.length === 0) return [];

    // Step 1: Extract Unique SLO Codes from User Query for boosted matching
    const extractedSLOs = extractSLOCodes(query);
    console.log(`🎯 [Retriever] Query: "${query}" | SLOs Detected:`, extractedSLOs);
    
    // Step 2: Generate Vector Embedding (text-embedding-004)
    const queryEmbedding = await generateEmbedding(query);
    
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      console.error('❌ [Retriever] Vector synthesis failed.');
      return [];
    }

    // Step 3: Call Supabase RPC with broadened scope
    // The RPC handles document filtering and SLO code boosting
    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v2', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: documentIds,
      priority_document_id: documentIds[0], 
      boost_tags: extractedSLOs.length > 0 ? extractedSLOs : []
    });
    
    if (error) {
      console.error('❌ [Retriever] Supabase RPC error:', error.message);
      return [];
    }
    
    console.log(`✅ [Retriever] Fetched ${chunks?.length || 0} chunks from ${documentIds.length} assets.`);
    
    return (chunks || []).map((d: any) => ({
      chunk_id: d.chunk_id,
      chunk_text: d.chunk_text,
      slo_codes: d.slo_codes || [],
      page_number: d.page_number,
      section_title: d.section_title,
      combined_score: d.combined_score
    }));
    
  } catch (err) {
    console.error('❌ [Retriever] Fatal error:', err);
    return [];
  }
}
