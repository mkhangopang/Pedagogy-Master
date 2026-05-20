
import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { extractSLOCodes, normalizeSLO } from './slo-extractor';

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
 * TIERED NEURAL RETRIEVER (v38.1 - RESILIENT)
 * Optimized for Dialect-Aware Hybrid Search with Auto-Fallback.
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

    // TIER 2: SLO CODE TEXT FALLBACK
    // When semantic search produces no/low results, or if hybrid chunks are empty,
    // look for direct substring matches for SLO-style codes to survive bare code queries.
    let textFallbackChunks: any[] = [];
    const sloCodePattern = /\b([A-Z]{1,3})(\d{2})([A-Z])[-]?(\d{1,4})\b/i;
    const sloMatch = query.match(sloCodePattern);
    if (sloMatch) {
      const sloCode = sloMatch[0].toUpperCase();
      const normalizedSlo = normalizeSLO(sloCode);
      const { data: textMatches } = await supabase
        .from('document_chunks')
        .select('id, document_id, chunk_text, slo_codes, metadata')
        .in('document_id', documentIds)
        .or(`chunk_text.ilike.%${sloCode}%,chunk_text.ilike.%${normalizedSlo}%`)
        .limit(matchCount);
      if (textMatches && textMatches.length > 0) {
        textFallbackChunks = textMatches.map(c => ({
          id: c.id,
          document_id: c.document_id,
          chunk_text: c.chunk_text,
          slo_codes: c.slo_codes || [],
          metadata: c.metadata || {},
          combined_score: 0.95
        }));
      }
    }

    if (textFallbackChunks.length > 0) {
      return textFallbackChunks;
    }

    // TIER 3: RECOVERY LOGIC (v4 Broader Search)
    if (rpcError || !hybridChunks || hybridChunks.length === 0) {
      if (rpcError) console.warn('⚠️ hybrid_search_chunks_v6 RPC error, engaging fallback.');
      
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

    return hybridChunks.map((m: any) => ({
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
