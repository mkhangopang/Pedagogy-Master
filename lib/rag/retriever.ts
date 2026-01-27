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
 * HIGH-PRECISION RAG RETRIEVER (v41.0)
 * Optimized for Grade Isolation and SLO Target Locking.
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

    // CRITICAL: Identify targeted grade from SLO code
    const targetSLOs = parsed.sloCodes.length > 0 ? parsed.sloCodes : null;
    const requestedGrade = targetSLOs ? extractGradeFromSLO(targetSLOs[0]) : null;

    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: documentIds,
      filter_tags: targetSLOs, 
      filter_grades: requestedGrade ? [requestedGrade] : (parsed.grades.length > 0 ? parsed.grades : null),
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

    // Post-Retrieval Verification: Strict Grade Lock
    // If user explicitly asked for S8, we prune any S4 matches that vector search accidentally pulled.
    if (requestedGrade) {
      processed = processed.filter(c => {
        // If the chunk has explicit grade levels, check for match
        if (c.grade_levels && c.grade_levels.length > 0) {
          return c.grade_levels.includes(requestedGrade);
        }
        // Fallback: Check if chunk mentions the specific requested SLO code
        if (targetSLOs && targetSLOs.length > 0) {
           return c.slo_codes.some(code => targetSLOs.includes(code));
        }
        return true; 
      });
    }

    performanceMonitor.track('rag_retrieval_v41', performance.now() - start);
    return processed.slice(0, 8); 
    
  } catch (err) {
    console.error('❌ [Retriever] High Precision Failure:', err);
    return [];
  }
}