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
 * HIGH-PRECISION RAG RETRIEVER (v24.0)
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
    // 1. Extract Unique SLO Codes from Query for Boosting
    const extractedSLOs = Array.from(new Set(extractSLOCodes(query)));
    
    // 2. Generate Vector Embedding (text-embedding-004)
    const queryEmbedding = await generateEmbedding(query);
    
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      console.error('❌ [Retriever] Vector synthesis failed or dimension mismatch.');
      return [];
    }
    
    console.log(`📡 [Retriever] Searching for: "${query}" in document: ${documentId}`);
    console.log(`🚀 [Retriever] SLO Boost Tags:`, extractedSLOs);

    // 3. Call Supabase RPC with CORRECT parameters (v2 Fix)
    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v2', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: [documentId], // MUST be array
      priority_document_id: documentId,
      boost_tags: extractedSLOs.length > 0 ? extractedSLOs : []
    });
    
    if (error) {
      console.error('❌ [Retriever] Supabase RPC Error:', error.message);
      return [];
    }
    
    if (!chunks || chunks.length === 0) {
      console.warn(`⚠️ [Retriever] 0 nodes found for query: "${query}"`);
      return [];
    }
    
    console.log(`✅ [Retriever] Found ${chunks.length} matching curriculum nodes.`);
    
    return chunks.map((d: any) => ({
      chunk_id: d.chunk_id,
      chunk_text: d.chunk_text,
      slo_codes: d.slo_codes || [],
      combined_score: d.combined_score,
      page_number: d.page_number,
      section_title: d.section_title
    }));
    
  } catch (err) {
    console.error('❌ [Retriever] Neural fetch exception:', err);
    return [];
  }
}