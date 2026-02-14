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
 * TIERED NEURAL RETRIEVER (v38.0)
 * Optimized for Dialect-Aware Hybrid Search (SQL v110).
 */
export async function retrieveRelevantChunks({
  query,
  documentIds,
  supabase,
  matchCount = 8,
  dialect
}: {
  query: string;
  documentIds: string[];
  supabase: SupabaseClient;
  matchCount?: number;
  dialect?: string;
}): Promise<RetrievedChunk[]> {
  try {
    if (!documentIds || documentIds.length === 0) return [];

    const queryEmbedding = await generateEmbedding(query);
    
    // TIER 1: SEMANTIC SEARCH (v6 Dialect Aware)
    const { data: hybridChunks, error: rpcError } = await supabase.rpc('hybrid_search_chunks_v6', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount, 
      filter_document_ids: documentIds,
      dialect_filter: dialect || null
    });

    if (rpcError) {
      console.warn('⚠️ hybrid_search_chunks_v6 failed, falling back to basic vector search.');
      const { data: fallback, error: fallbackError } = await supabase.rpc('hybrid_search_chunks_v4', {
        query_text: query,
        query_embedding: queryEmbedding,
        match_count: matchCount, 
        filter_document_ids: documentIds
      });
      if (fallbackError) throw fallbackError;
      return (fallback || []).map((m: any) => ({
        chunk_id: m.id,
        document_id: m.document_id,
        chunk_text: m.chunk_text,
        slo_codes: m.slo_codes || [],
        metadata: m.metadata || {},
        combined_score: m.combined_score || 0.5
      }));
    }

    return (hybridChunks || []).map((m: any) => ({
      chunk_id: m.id,
      document_id: m.document_id,
      chunk_text: m.chunk_text,
      slo_codes: m.slo_codes || [],
      metadata: m.metadata || {},
      combined_score: m.combined_score || 0.5
    }));

  } catch (err) {
    console.error('❌ [Retriever] Critical Fault:', err);
    return [];
  }
}
