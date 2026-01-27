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
 * HIGH-PRECISION RAG RETRIEVER (v42.0)
 * Optimized for Grade Isolation and Deterministic SLO Target Locking.
 */
export async function retrieveRelevantChunks({
  query,
  documentIds,
  supabase,
  matchCount = 20 
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

    // Initial search with metadata hints
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

    // POST-RETRIEVAL ISOLATION (CHATGPT-LEVEL PRECISION)
    // If a specific SLO was requested (e.g. S8A5), we MUST discard results that don't match the SLO or Grade.
    if (targetSLOs && targetSLOs.length > 0) {
      processed = processed.filter(c => {
        return c.slo_codes.some((code: string) => targetSLOs.includes(code));
      });
    }

    // Secondary Check: Strict Grade Lock
    if (requestedGrade && processed.length > 0) {
      processed = processed.filter(c => {
        if (!c.grade_levels || c.grade_levels.length === 0) return true; // Keep general pedagogical context
        return c.grade_levels.includes(requestedGrade);
      });
    }

    performanceMonitor.track('rag_retrieval_v42', performance.now() - start);
    // Return the top 8 most precise segments
    return processed.slice(0, 8); 
    
  } catch (err) {
    console.error('❌ [Retriever] High Precision Failure:', err);
    return [];
  }
}