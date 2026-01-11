import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';

export interface RetrievedChunk {
  text: string;
  sloCodes: string[];
  similarity: number;
  id: string;
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
  
  if (!documentIds || documentIds.length === 0) {
    console.warn('[Retriever] No document IDs provided for search.');
    return [];
  }

  try {
    // 1. Vectorize Query
    console.log(`[Retriever] Vectorizing query: "${query.substring(0, 50)}..."`);
    const queryEmbedding = await generateEmbedding(query);

    // 2. Execute Hybrid Search RPC
    // We use a slightly lower match threshold (0.6) to allow for broader semantic relevance
    const { data, error } = await supabase.rpc('hybrid_search_chunks', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: maxChunks,
      filter_document_ids: documentIds
    });

    if (error) {
      console.error('[Retriever RPC Error]:', error);
      throw error;
    }

    const results = (data || []).map((r: any) => ({
      id: r.chunk_id,
      text: r.chunk_text,
      sloCodes: r.slo_codes || [],
      similarity: r.combined_score
    }));

    console.log(`[Retriever] Found ${results.length} relevant chunks across selected assets.`);
    return results;
  } catch (err) {
    console.error('[Retriever Critical Error]:', err);
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
  const { data, error } = await supabase
    .from('document_chunks')
    .select('id, chunk_text, slo_codes')
    .contains('slo_codes', [sloCode])
    .in('document_id', documentIds)
    .limit(3);

  if (error) {
    console.error('[SLO Lookup Error]:', error);
    return [];
  }

  return (data || []).map(d => ({
    id: d.id,
    text: d.chunk_text,
    sloCodes: d.slo_codes,
    similarity: 1.0
  }));
}
