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
}

/**
 * NEURAL RE-RANKER
 * Refines vector results using a reasoning model.
 */
async function reRankChunks(query: string, candidates: RetrievedChunk[]): Promise<RetrievedChunk[]> {
  if (candidates.length <= 5) return candidates;
  
  const start = performance.now();
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const chunkOptions = candidates.map((c, i) => `[ID:${i}] ${c.chunk_text.substring(0, 400)}`).join('\n\n');
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Identify the TOP 5 most relevant curriculum segments for this teacher query.
      
      QUERY: "${query}"
      
      CANDIDATES:
      ${chunkOptions}
      
      Respond only with comma-separated IDs.`,
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
 * HIGH-PRECISION RAG RETRIEVER (v33.0)
 * Integrated with Hybrid 70/30 Scoring function.
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

    // 1. Hybrid Vector & Full-Text Search
    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_text: query, // Explicitly passing the raw text for ts_rank
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
      bloom_levels: d.bloom_levels || []
    }));

    // 2. Semantic Re-ranking
    const finalResults = await reRankChunks(query, processed);
    
    performanceMonitor.track('rag_retrieval_full_pipeline', performance.now() - start);
    return finalResults;
    
  } catch (err) {
    console.error('❌ [Retriever] Fault:', err);
    return [];
  }
}