import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';
import { parseUserQuery } from './query-parser';

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  chunk_text: string;
  slo_codes: string[];
  metadata: any;
  combined_score: number;
  is_verbatim_definition?: boolean;
}

/**
 * TIERED NEURAL RETRIEVER (v37.0)
 * Optimized for reduced context bloat and rapid synthesis.
 */
export async function retrieveRelevantChunks({
  query,
  documentIds,
  supabase,
  matchCount = 8 // Optimized for context safety
}: {
  query: string;
  documentIds: string[];
  supabase: SupabaseClient;
  matchCount?: number;
}): Promise<RetrievedChunk[]> {
  try {
    if (!documentIds || documentIds.length === 0) return [];

    const parsed = parseUserQuery(query);
    const resultsMap = new Map<string, RetrievedChunk>();
    
    // TIER 1: SEMANTIC VECTOR SEARCH
    const queryEmbedding = await generateEmbedding(query);
    const { data: hybridChunks, error: rpcError } = await supabase.rpc('hybrid_search_chunks_v4', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount, 
      filter_document_ids: documentIds,
      full_text_weight: 0.2, // Focus on semantic meaning
      vector_weight: 0.8
    });

    if (!rpcError && hybridChunks) {
      hybridChunks.forEach((m: any) => {
        resultsMap.set(m.id, {
          chunk_id: m.id,
          document_id: m.document_id,
          chunk_text: m.chunk_text,
          slo_codes: m.slo_codes || [],
          metadata: m.metadata || {},
          combined_score: m.combined_score || 0.5,
          is_verbatim_definition: false
        });
      });
    }

    return Array.from(resultsMap.values())
      .sort((a, b) => b.combined_score - a.combined_score);

  } catch (err) {
    console.error('❌ [Retriever] Critical Fault:', err);
    return [];
  }
}