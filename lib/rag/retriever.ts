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
 * HIGH-PRECISION TOOL-FACTORY RETRIEVER (v20.0)
 * Optimized to find the specific SLO "seed" needed for pedagogical synthesis.
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  matchCount: number = 5,
  priorityDocumentId?: string
): Promise<RetrievedChunk[]> {
  try {
    // 1. Extract SLO codes from user query for semantic boosting
    const extractedSLOs = extractSLOCodes(query);
    
    // 2. Generate query embedding (768 dimensions)
    const queryEmbedding = await generateEmbedding(query);
    
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      console.error('❌ Invalid embedding dimensions');
      return [];
    }
    
    // 3. Call Supabase RPC with high-precision filtering
    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v2', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: documentIds, // MUST be array
      priority_document_id: priorityDocumentId || null,
      boost_tags: extractedSLOs.length > 0 ? extractedSLOs : []
    });
    
    if (error) {
      console.error('❌ Supabase RPC Error:', error.message);
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
    console.error('❌ RAG Retrieval Node Failure:', err);
    return [];
  }
}