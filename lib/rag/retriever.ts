import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

export { extractSLOCodes };

export interface RetrievedChunk {
  chunk_id: string;
  chunk_text: string;
  slo_codes: string[];
  combined_score: number;
  section_title?: string;
  page_number?: number;
}

/**
 * HIGH-PRECISION TOOL-FACTORY RETRIEVER (v21.0)
 * Optimized for hybrid search with semantic SLO boosting.
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  matchCount: number = 5,
  priorityDocumentId?: string
): Promise<RetrievedChunk[]> {
  try {
    if (!documentIds || documentIds.length === 0) return [];

    // 1. Neural Analysis of Query
    const extractedSLOs = extractSLOCodes(query);
    const queryEmbedding = await generateEmbedding(query);
    
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      console.error('❌ [Retriever] Invalid embedding generated.');
      return [];
    }
    
    // 2. Execute Hybrid Search RPC
    // Parameters must match supabase_schema.sql v21.0 exactly
    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v2', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: documentIds, 
      priority_document_id: priorityDocumentId || null,
      boost_tags: extractedSLOs.length > 0 ? extractedSLOs : []
    });
    
    if (error) {
      console.error('❌ [Retriever] Supabase RPC Failure:', error.message);
      return [];
    }
    
    return (chunks || []).map((d: any) => ({
      chunk_id: d.chunk_id,
      chunk_text: d.chunk_text,
      slo_codes: d.slo_codes || [],
      combined_score: d.combined_score,
      page_number: d.page_number,
      section_title: d.section_title
    }));
    
  } catch (err) {
    console.error('❌ [Retriever] Node Exception:', err);
    return [];
  }
}