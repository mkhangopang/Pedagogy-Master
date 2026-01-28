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
 * HIGH-PRECISION RAG RETRIEVER (v45.0)
 * Implements Tag-First priority search to prevent semantic crowding.
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

    // CRITICAL: Precise Extraction
    const targetSLOCodes = parsed.sloCodes.length > 0 ? parsed.sloCodes : [];
    const requestedGrade = targetSLOCodes.length > 0 
      ? extractGradeFromSLO(targetSLOCodes[0]) 
      : (parsed.grades.length > 0 ? parsed.grades[0] : null);

    // 1. ATOMIC SEARCH: Explicit search for chunks containing normalized tags
    // This bypasses vector similarity to ensure exact SLO matches are found
    let exactResults: any[] = [];
    if (targetSLOCodes.length > 0) {
      const { data: tagged } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .contains('slo_codes', targetSLOCodes)
        .limit(10);
      if (tagged) exactResults = tagged;
    }

    // 2. HYBRID SEARCH: Semantic fallback
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
      chunk_id: d.chunk_id || d.id,
      chunk_text: d.chunk_text,
      slo_codes: d.slo_codes || [],
      page_number: d.metadata?.page_number,
      section_title: d.metadata?.section_title || d.unit_name,
      combined_score: d.combined_score || 0.9,
      grade_levels: d.grade_levels || [],
      topics: d.topics || [],
      bloom_levels: d.bloom_levels || [],
      document_id: d.document_id
    }));

    // Merge exact results at the top if not already present
    if (exactResults.length > 0) {
      const exactProcessed = exactResults.map(d => ({
        chunk_id: d.id,
        chunk_text: d.chunk_text,
        slo_codes: d.slo_codes || [],
        page_number: d.metadata?.page_number,
        section_title: d.metadata?.section_title || d.unit_name,
        combined_score: 1.0, // Forced priority
        grade_levels: d.grade_levels || [],
        topics: d.topics || [],
        bloom_levels: d.bloom_levels || [],
        document_id: d.document_id
      }));
      
      const existingIds = new Set(processed.map(p => p.chunk_id));
      const uniqueExact = exactProcessed.filter(ep => !existingIds.has(ep.chunk_id));
      processed = [...uniqueExact, ...processed];
    }

    // 3. GRADE LOCKING: Strict exclusion of mismatching grades
    if (requestedGrade && processed.length > 0) {
      processed = processed.filter(c => {
        // If chunk has grade labels, it MUST match the requested grade
        if (c.grade_levels && c.grade_levels.length > 0) {
          return c.grade_levels.includes(requestedGrade);
        }
        // If it mentions the code directly in text, keep it regardless of metadata
        const normalizedInText = targetSLOCodes.some(code => c.chunk_text.replace(/[^A-Z0-9]/gi, '').includes(code));
        return normalizedInText;
      });
    }

    performanceMonitor.track('rag_retrieval_v45', performance.now() - start);
    return processed.slice(0, 15); 
    
  } catch (err) {
    console.error('❌ [Retriever] Fault:', err);
    return [];
  }
}