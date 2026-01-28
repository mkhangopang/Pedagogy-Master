import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { parseUserQuery } from './query-parser';
import { performanceMonitor } from '../monitoring/performance';
import { extractGradeFromSLO } from './slo-extractor';

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
  document_id?: string;
}

/**
 * HIGH-PRECISION RAG RETRIEVER (v43.0)
 * Optimized for Depth and Standard Locking.
 */
export async function retrieveRelevantChunks({
  query,
  documentIds,
  supabase,
  matchCount = 40 // Increased for greater depth into large curriculum files
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

    // CRITICAL: Identify targeted grade from SLO code to prevent cross-grade hallucinations
    const targetSLOs = parsed.sloCodes.length > 0 ? parsed.sloCodes : null;
    const requestedGrade = targetSLOs ? extractGradeFromSLO(targetSLOs[0]) : (parsed.grades.length > 0 ? parsed.grades[0] : null);

    // Initial hybrid search with higher match count to ensure "S8 C3" at the bottom isn't buried
    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: documentIds,
      filter_tags: targetSLOs, 
      filter_grades: requestedGrade ? [requestedGrade] : null,
      filter_subjects: parsed.topics.length > 0 ? parsed.topics : null
    });
    
    if (error) throw error;
    
    let processed = (chunks as any[] || []).map((d: any) => ({
      chunk_id: d.chunk_id,
      chunk_text: d.chunk_text,
      slo_codes: d.slo_codes || [],
      page_number: d.metadata?.page_number,
      section_title: d.metadata?.section_title,
      combined_score: d.combined_score,
      grade_levels: d.grade_levels || [],
      topics: d.topics || [],
      bloom_levels: d.bloom_levels || [],
      document_id: d.document_id
    }));

    // POST-RETRIEVAL ISOLATION (CHALLENGE: If S8A7 is easier than S8C3, strict filtering wins)
    if (targetSLOs && targetSLOs.length > 0) {
      processed = processed.filter(c => {
        return c.slo_codes.some((code: string) => targetSLOs.includes(code));
      });
    }

    // Secondary Check: Strict Grade Lock
    if (requestedGrade && processed.length > 0) {
      processed = processed.filter(c => {
        if (!c.grade_levels || c.grade_levels.length === 0) return true;
        return c.grade_levels.includes(requestedGrade);
      });
    }

    performanceMonitor.track('rag_retrieval_v43', performance.now() - start);
    // Return top 12 precise segments instead of 8 to give AI more context depth
    return processed.slice(0, 12); 
    
  } catch (err) {
    console.error('❌ [Retriever] High Precision Failure:', err);
    return [];
  }
}
