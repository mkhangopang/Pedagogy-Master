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
 * NEURAL RE-RANKER (Next Step 1 Implementation)
 * Uses Gemini 3 Flash to pick the absolute top 5 most relevant chunks from a pool of 20.
 */
async function reRankChunks(query: string, candidates: RetrievedChunk[]): Promise<RetrievedChunk[]> {
  if (candidates.length <= 5) return candidates;
  
  const start = performance.now();
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Simplified chunk representations for re-ranking prompt
    const chunkOptions = candidates.map((c, i) => `[ID:${i}] ${c.chunk_text.substring(0, 300)}`).join('\n\n');
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a high-precision re-ranking node. Given a teacher's query and a list of curriculum chunks, select the IDs of the TOP 5 most pedagogically relevant chunks.
      
      QUERY: "${query}"
      
      CHUNKS:
      ${chunkOptions}
      
      Respond ONLY with a comma-separated list of IDs (e.g., "0,4,7,12,19").`,
    });

    const selectedIds = response.text?.match(/\d+/g)?.map(Number) || [];
    const topChunks = selectedIds
      .map(id => candidates[id])
      .filter(Boolean)
      .slice(0, 5);

    performanceMonitor.track('semantic_re_rank', performance.now() - start, { selectedCount: topChunks.length });
    return topChunks.length > 0 ? topChunks : candidates.slice(0, 5);
  } catch (e) {
    console.warn('⚠️ [Re-ranker] Failed, falling back to vector ordering.');
    return candidates.slice(0, 5);
  }
}

/**
 * HIGH-PRECISION RAG RETRIEVER (v32.0 - RE-RANKING ENABLED)
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

    // 1. Hybrid Vector Search (Retrieves pool of 20)
    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: documentIds,
      priority_document_id: documentIds[0], 
      boost_slo_codes: parsed.sloCodes,
      filter_grades: parsed.grades.length > 0 ? parsed.grades : null,
      filter_topics: parsed.topics.length > 0 ? parsed.topics : null,
      filter_bloom: parsed.bloomLevel ? [parsed.bloomLevel] : null
    });
    
    if (error) throw error;
    
    // Fix: Explicitly type 'd' to 'any' to resolve build failure on RPC return mapping
    const processed = (chunks as any[] || []).map((d: any) => ({
      chunk_id: d.chunk_id,
      chunk_text: d.chunk_text,
      slo_codes: d.slo_codes || [],
      page_number: d.page_number,
      section_title: d.section_title,
      combined_score: d.combined_score,
      grade_levels: d.grade_levels,
      topics: d.topics,
      bloom_levels: d.bloom_levels
    }));

    // 2. Semantic Re-ranking (Refines to top 5)
    const finalResults = await reRankChunks(query, processed);
    
    performanceMonitor.track('rag_retrieval_full_pipeline', performance.now() - start);
    return finalResults;
    
  } catch (err) {
    console.error('❌ [Retriever] Critical Fault:', err);
    return [];
  }
}