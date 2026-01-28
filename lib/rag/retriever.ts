import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { parseUserQuery } from './query-parser';
import { performanceMonitor } from '../monitoring/performance';
import { extractGradeFromSLO, normalizeSLO } from './slo-extractor';

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
 * HIGH-PRECISION RAG RETRIEVER (v44.0)
 * Optimized for Depth Scanning and Strict Objective Anchoring.
 */
export async function retrieveRelevantChunks({
  query,
  documentIds,
  supabase,
  matchCount = 40 // Increased for greater depth (prevents burying bottom SLOs like S8C3)
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

    // CRITICAL: Precise Extraction
    const targetSLOCodes = parsed.sloCodes.length > 0 ? parsed.sloCodes : [];
    const requestedGrade = targetSLOCodes.length > 0 
      ? extractGradeFromSLO(targetSLOCodes[0]) 
      : (parsed.grades.length > 0 ? parsed.grades[0] : null);

    // Initial BROAD hybrid search
    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount, 
      filter_document_ids: documentIds,
      filter_tags: targetSLOCodes.length > 0 ? targetSLOCodes : null, 
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

    // NEURAL ANCHORING (FIX: Explicitly search for exact matches in results)
    if (targetSLOCodes.length > 0) {
      // Step A: Separate exact matches to the top
      const exactMatches = processed.filter(c => 
        c.slo_codes.some((code: string) => targetSLOCodes.includes(normalizeSLO(code)))
      );
      
      // Step B: If we found exact matches, make them priority context
      if (exactMatches.length > 0) {
        const others = processed.filter(c => !exactMatches.includes(c));
        processed = [...exactMatches, ...others];
      }
    }

    // Secondary Check: Strict Grade Lock (Prevents Grade 4 bleeding into Grade 8)
    if (requestedGrade && processed.length > 0) {
      processed = processed.filter(c => {
        if (!c.grade_levels || c.grade_levels.length === 0) return true;
        return c.grade_levels.includes(requestedGrade);
      });
    }

    performanceMonitor.track('rag_retrieval_v44', performance.now() - start);
    
    // Provide AI with more context chunks (up to 15) for deeper reasoning
    return processed.slice(0, 15); 
    
  } catch (err) {
    console.error('❌ [Retriever] Precision Failure:', err);
    return [];
  }
}
