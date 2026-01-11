import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';

export interface RetrievedChunk {
  text: string;
  sloCodes: string[];
  similarity: number;
}

/**
 * HYBRID NEURAL RETRIEVER
 * Finds the most relevant curriculum segments for a given teacher query.
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  maxChunks: number = 5
): Promise<RetrievedChunk[]> {
  
  try {
    // 1. Vectorize Query
    const queryEmbedding = await generateEmbedding(query);

    // 2. Execute Hybrid Search RPC
    // match_threshold: 0.65 is optimal for academic documents
    const { data, error } = await supabase.rpc('hybrid_search_chunks', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: maxChunks,
      filter_document_ids: documentIds
    });

    if (error) throw error;

    return (data || []).map((r: any) => ({
      text: r.chunk_text,
      sloCodes: r.slo_codes || [],
      similarity: r.combined_score
    }));
  } catch (err) {
    console.error('[Retriever Error]:', err);
    return [];
  }
}

/**
 * SLO DIRECT LOOKUP
 * Bypasses semantic search for exact SLO code matches (Instant).
 */
export async function retrieveChunksForSLO(
  sloCode: string,
  documentIds: string[],
  supabase: SupabaseClient
): Promise<RetrievedChunk[]> {
  const { data } = await supabase
    .from('document_chunks')
    .select('chunk_text, slo_codes')
    .contains('slo_codes', [sloCode])
    .in('document_id', documentIds)
    .limit(3);

  return (data || []).map(d => ({
    text: d.chunk_text,
    sloCodes: d.slo_codes,
    similarity: 1.0
  }));
}
