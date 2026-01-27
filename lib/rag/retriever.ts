import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { parseUserQuery } from './query-parser';
import { performanceMonitor } from '../monitoring/performance';
import { GoogleGenAI } from '@google/genai';

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
 * HIGH-PRECISION RAG RETRIEVER (v40.0)
 * Optimized for SLO Isolation and Multi-Model synergy.
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

    // CRITICAL: Precise SLO Target Lock
    // If user asked for S8A5, we MUST tell the database to strictly filter by that tag.
    const targetSLOs = parsed.sloCodes.length > 0 ? parsed.sloCodes : null;

    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: documentIds,
      filter_tags: targetSLOs, // Strictly filter by SLO if detected
      filter_grades: parsed.grades.length > 0 ? parsed.grades : null,
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

    // Post-Retrieval Verification: Eliminate Cross-Talk
    // If targetSLOs exist, remove any chunk that explicitly mentions a DIFFERENT SLO
    // This stops S8 queries from showing S4 content.
    if (targetSLOs && targetSLOs.length > 0) {
      processed = processed.filter(c => {
        if (c.slo_codes.length === 0) return true; // Keep general context
        return c.slo_codes.some(code => targetSLOs.includes(code));
      });
    }

    performanceMonitor.track('rag_retrieval_v40', performance.now() - start);
    return processed.slice(0, 7); // Return top 7 most precise segments
    
  } catch (err) {
    console.error('❌ [Retriever] High Precision Failure:', err);
    return [];
  }
}