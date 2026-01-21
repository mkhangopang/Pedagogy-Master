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
 * NEURAL RE-RANKER (v5.0)
 * Implements "Hard-Match" filtering for curriculum standards.
 */
async function reRankChunks(query: string, candidates: RetrievedChunk[], targetSLOs: string[]): Promise<RetrievedChunk[]> {
  if (candidates.length === 0) return [];
  
  // STRATEGY: If target SLOs are extracted from the query, 
  // we MUST ensure those chunks appear first and other similar standards are suppressed.
  if (targetSLOs.length > 0) {
    const exactMatches = candidates.filter(c => 
      c.slo_codes.some(code => targetSLOs.includes(code))
    );

    if (exactMatches.length > 0) {
      console.log(`🎯 [Re-ranker] Found ${exactMatches.length} exact standard matches. Prioritizing.`);
      // Return exact matches first, then fill remaining slots with semantic matches 
      // that are NOT different SLO codes (to avoid cross-talk).
      const relevantNonSlo = candidates.filter(c => 
        !exactMatches.includes(c) && 
        (c.slo_codes.length === 0 || c.slo_codes.some(code => targetSLOs.includes(code)))
      );
      
      return [...exactMatches, ...relevantNonSlo].slice(0, 7);
    }
  }

  // Fallback to standard re-ranking for general queries
  if (candidates.length <= 3) return candidates;

  const start = performance.now();
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const chunkOptions = candidates.map((c, i) => `[ID:${i}] ${c.chunk_text.substring(0, 400)}`).join('\n\n');
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Rank the most relevant curriculum chunks.
      QUERY: "${query}"
      TARGETS: ${targetSLOs.join(', ') || 'General Concept'}
      
      CANDIDATES:
      ${chunkOptions}
      
      Return top 5 IDs comma-separated.`,
    });

    const selectedIds = response.text?.match(/\d+/g)?.map(Number) || [];
    const topChunks = selectedIds
      .map(id => candidates[id])
      .filter(Boolean)
      .slice(0, 5);

    performanceMonitor.track('semantic_re_rank', performance.now() - start);
    return topChunks.length > 0 ? topChunks : candidates.slice(0, 5);
  } catch (e) {
    return candidates.slice(0, 5);
  }
}

/**
 * HIGH-PRECISION RAG RETRIEVER (v35.0)
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
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: documentIds,
      filter_tags: parsed.sloCodes.length > 0 ? parsed.sloCodes : null,
      filter_grades: parsed.grades.length > 0 ? parsed.grades : null,
      filter_subjects: parsed.topics.length > 0 ? parsed.topics : null
    });
    
    if (error) throw error;
    
    const processed = (chunks as any[] || []).map((d: any) => ({
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

    const finalResults = await reRankChunks(query, processed, parsed.sloCodes);
    
    performanceMonitor.track('rag_retrieval_full_pipeline', performance.now() - start);
    return finalResults;
    
  } catch (err) {
    console.error('❌ [Retriever] Fault:', err);
    return [];
  }
}