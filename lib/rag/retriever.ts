import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { parseUserQuery } from './query-parser';
import { performanceMonitor } from '../monitoring/performance';

export interface RetrievedChunk {
  chunk_id: string;
  chunk_text: string;
  slo_codes: string[];
  page_number: number | null;
  section_title: string | null;
  combined_score: number | null;
  grade_levels?: string[];
  topics?: string[];
  bloom_levels?: string[];
}

/**
 * HIGH-PRECISION RAG RETRIEVER (v31.0 - PERFORMANCE TRACKED)
 */
export async function retrieveRelevantChunks({
  query,
  documentIds,
  supabase,
  matchCount = 25 
}: {
  query: string;
  documentIds: string[];
  supabase: SupabaseClient;
  matchCount?: number;
}): Promise<RetrievedChunk[]> {
  const start = performance.now();
  try {
    if (!documentIds || documentIds.length === 0) return [];

    const parsed = parseUserQuery(query);
    const queryEmbedding = await generateEmbedding(query);
    
    if (!queryEmbedding || queryEmbedding.length !== 768) return [];

    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: documentIds,
      priority_document_id: documentIds[0], 
      boost_slo_codes: parsed.sloCodes,
      filter_grades: parsed.grades.length > 0 ? parsed.grades : null,
      filter_topics: parsed.topics.length > 0 ? parsed.topics : null,
      filter_bloom: parsed.bloomLevel ? [parsed.bloomLevel] : null
    });
    
    if (error) {
      console.error('❌ [Retriever] RPC v3 Failure:', error.message);
      const { data: v2Chunks } = await supabase.rpc('hybrid_search_chunks_v2', {
        query_embedding: queryEmbedding,
        match_count: matchCount,
        filter_document_ids: documentIds,
        priority_document_id: documentIds[0],
        boost_tags: parsed.sloCodes
      });
      return (v2Chunks || []).map(processResult);
    }
    
    performanceMonitor.track('rag_retrieval_total', performance.now() - start, { chunkCount: chunks?.length });
    return (chunks || []).map(processResult);
    
    function processResult(d: any): RetrievedChunk {
      return {
        chunk_id: d.chunk_id,
        chunk_text: d.chunk_text,
        slo_codes: d.slo_codes || [],
        page_number: d.page_number,
        section_title: d.section_title,
        combined_score: d.combined_score,
        grade_levels: d.grade_levels,
        topics: d.topics,
        bloom_levels: d.bloom_levels
      };
    }
    
  } catch (err) {
    console.error('❌ [Retriever] Critical Fault:', err);
    return [];
  }
}