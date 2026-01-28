import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { parseUserQuery } from './query-parser';
import { performanceMonitor } from '../monitoring/performance';
import { extractGradeFromSLO, normalizeSLO } from './slo-extractor';

export interface RetrievedChunk {
  chunk_id: string;
  // Fix: Added missing document_id property to interface
  document_id: string;
  chunk_text: string;
  slo_codes: string[];
  page_number: number | null;
  section_title: string | null;
  combined_score: number | null;
  grade_levels?: string[];
  topics?: string[];
  is_exact_match?: boolean;
}

/**
 * HIGH-FIDELITY RAG RETRIEVER (v48.0)
 * Optimized for Sindh Curriculum Verification.
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
    
    // 1. TARGET EXTRACTION
    const targetSLOCodes = parsed.sloCodes.length > 0 ? parsed.sloCodes : [];
    const requestedGrade = targetSLOCodes.length > 0 
      ? extractGradeFromSLO(targetSLOCodes[0]) 
      : (parsed.grades.length > 0 ? parsed.grades[0] : null);

    // 2. STAGE 1: HARD KEYWORD "SLO TAG" MATCH
    // If user asked for S-08-C-03, we look for that EXACT tag first.
    let keywordResults: any[] = [];
    if (targetSLOCodes.length > 0) {
      const { data: tagged } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .overlaps('slo_codes', targetSLOCodes)
        .limit(15);
      
      if (tagged) {
        keywordResults = tagged.map(d => ({ ...d, is_exact_match: true }));
      }
    }

    // 3. STAGE 2: HYBRID SEMANTIC SEARCH
    const { data: hybridChunks, error } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount, 
      filter_document_ids: documentIds,
      filter_tags: targetSLOCodes.length > 0 ? targetSLOCodes : null, 
      filter_grades: requestedGrade ? [requestedGrade] : null
    });
    
    if (error) throw error;
    
    // Fix: Added document_id and page_number to hybrid search mapping to match interface
    let processed = (hybridChunks as any[] || []).map((d: any) => ({
      chunk_id: d.chunk_id || d.id,
      document_id: d.document_id,
      chunk_text: d.chunk_text,
      slo_codes: d.slo_codes || [],
      page_number: d.metadata?.page_number ?? null,
      section_title: d.metadata?.section_title || d.unit_name,
      combined_score: d.combined_score || 0.7,
      grade_levels: d.grade_levels || [],
      is_exact_match: d.slo_codes?.some((code: string) => targetSLOCodes.includes(code))
    }));

    // 4. MERGE & PRIORITIZE
    // Put hard matches at the very top to prevent mimicry
    if (keywordResults.length > 0) {
      const existingIds = new Set(processed.map(p => p.chunk_id));
      // Fix: Added document_id and page_number to keyword search mapping to match interface
      const uniqueKeywords = keywordResults
        .filter(k => !existingIds.has(k.id))
        .map(k => ({
          chunk_id: k.id,
          document_id: k.document_id,
          chunk_text: k.chunk_text,
          slo_codes: k.slo_codes || [],
          page_number: k.metadata?.page_number ?? null,
          section_title: k.metadata?.unit_name || 'Standard Definition',
          combined_score: 1.0, // Absolute match
          grade_levels: k.grade_levels || [],
          is_exact_match: true
        }));
      processed = [...uniqueKeywords, ...processed];
    }

    // 5. GRADE ISOLATION LOCK
    // If Grade 8 is requested, remove all Grade 4/5 chunks to prevent Keyword confusion
    if (requestedGrade && processed.length > 0) {
      const locked = processed.filter(c => {
        if (c.is_exact_match) return true;
        return c.grade_levels?.includes(requestedGrade);
      });
      if (locked.length > 0) processed = locked;
    }

    performanceMonitor.track('rag_retrieval_v48', performance.now() - start);
    return processed.slice(0, 15); 
    
  } catch (err) {
    console.error('❌ [Retriever] Fault:', err);
    return [];
  }
}