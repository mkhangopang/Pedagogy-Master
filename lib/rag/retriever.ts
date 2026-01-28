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
  is_exact_match?: boolean; // New flag for orchestrator awareness
}

/**
 * HIGH-PRECISION RAG RETRIEVER (v46.0)
 * Stage 1: Atomic Tag Matching
 * Stage 2: Semantic Hybrid Fallback
 */
export async function retrieveRelevantChunks({
  query,
  documentIds,
  supabase,
  matchCount = 40
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

    // 1. ATOMIC SEGMENTATION
    const targetSLOCodes = parsed.sloCodes.length > 0 ? parsed.sloCodes : [];
    const requestedGrade = targetSLOCodes.length > 0 
      ? extractGradeFromSLO(targetSLOCodes[0]) 
      : (parsed.grades.length > 0 ? parsed.grades[0] : null);

    // 2. STAGE 1: HARD KEYWORD MATCH (Highest Fidelity)
    // We look for chunks that EXPLICITLY contain the normalized SLO codes in their metadata tags.
    let exactResults: any[] = [];
    if (targetSLOCodes.length > 0) {
      const { data: tagged } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .overlap('slo_codes', targetSLOCodes)
        .limit(10);
      
      if (tagged) {
        exactResults = tagged.map(d => ({ ...d, is_exact_match: true }));
      }
    }

    // 3. STAGE 2: SEMANTIC HYBRID SEARCH
    const { data: hybridChunks, error } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount, 
      filter_document_ids: documentIds,
      filter_tags: targetSLOCodes.length > 0 ? targetSLOCodes : null, 
      filter_grades: requestedGrade ? [requestedGrade] : null,
      filter_subjects: parsed.topics.length > 0 ? parsed.topics : null
    });
    
    if (error) throw error;
    
    let processed = (hybridChunks as any[] || []).map((d: any) => ({
      chunk_id: d.chunk_id || d.id,
      chunk_text: d.chunk_text,
      slo_codes: d.slo_codes || [],
      page_number: d.metadata?.page_number,
      section_title: d.metadata?.section_title || d.unit_name,
      combined_score: d.combined_score || 0.8,
      grade_levels: d.grade_levels || [],
      topics: d.topics || [],
      bloom_levels: d.bloom_levels || [],
      document_id: d.document_id,
      is_exact_match: d.slo_codes?.some((code: string) => targetSLOCodes.includes(code))
    }));

    // 4. SYNTHESIS & DEDUPLICATION
    // Prepend Hard Matches to the front of the list
    if (exactResults.length > 0) {
      const exactProcessed = exactResults.map(d => ({
        chunk_id: d.id,
        chunk_text: d.chunk_text,
        slo_codes: d.slo_codes || [],
        page_number: d.metadata?.page_number,
        section_title: d.metadata?.section_title || d.unit_name,
        combined_score: 1.0, // Force priority
        grade_levels: d.grade_levels || [],
        topics: d.topics || [],
        bloom_levels: d.bloom_levels || [],
        document_id: d.document_id,
        is_exact_match: true
      }));
      
      const existingIds = new Set(processed.map(p => p.chunk_id));
      const uniqueExact = exactProcessed.filter(ep => !existingIds.has(ep.chunk_id));
      processed = [...uniqueExact, ...processed];
    }

    // 5. GRADE ISOLATION (Critical to prevent Grade 4 bleeding into Grade 8)
    if (requestedGrade && processed.length > 0) {
      processed = processed.filter(c => {
        const matchesGrade = c.grade_levels?.includes(requestedGrade);
        const matchesTagExactly = c.is_exact_match;
        return matchesGrade || matchesTagExactly;
      });
    }

    performanceMonitor.track('rag_retrieval_v46', performance.now() - start);
    // Return top 15 highest fidelity chunks for context
    return processed.slice(0, 15); 
    
  } catch (err) {
    console.error('❌ [Retriever] Fault State:', err);
    return [];
  }
}