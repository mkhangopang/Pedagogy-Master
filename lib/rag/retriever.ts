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
 * Calculates cosine similarity between two numeric vectors.
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const len = Math.min(vecA.length, vecB.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * TIERED NEURAL RETRIEVER (v40.0 - ULTRA-RESILIENT PGVECTOR PIPELINE)
 * Optimized for Supabase Vector / pgvector search with automatic multi-tier fallback.
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

    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (embErr: any) {
      console.warn('⚠️ [Retriever] Failed to generate query embedding, proceeding with text-based retrieval:', embErr.message);
    }

    // TIER 1: SEMANTIC SEARCH (v6 Dialect Aware pgvector RPC)
    if (queryEmbedding) {
      try {
        const { data: hybridChunks, error: rpcError } = await supabase.rpc('hybrid_search_chunks_v6', {
          query_text: query,
          query_embedding: queryEmbedding,
          match_count: matchCount, 
          filter_document_ids: documentIds,
          dialect_filter: dialect || null
        });

        if (!rpcError && hybridChunks && hybridChunks.length > 0) {
          return hybridChunks.map((m: any) => ({
            chunk_id: m.id,
            document_id: m.document_id,
            chunk_text: m.chunk_text,
            slo_codes: m.slo_codes || [],
            metadata: m.metadata || {},
            combined_score: m.combined_score || 0.85
          }));
        }
      } catch (e: any) {
        console.warn('⚠️ [Retriever] hybrid_search_chunks_v6 RPC execution exception:', e.message);
      }
    }

    // TIER 2: STANDARD SUPABASE PGVECTOR MATCH_DOCUMENTS RPC
    if (queryEmbedding) {
      try {
        const { data: matchDocs, error: matchError } = await supabase.rpc('match_documents', {
          query_embedding: queryEmbedding,
          match_count: matchCount,
          filter: { document_id: documentIds[0] }
        });

        if (!matchError && matchDocs && matchDocs.length > 0) {
          return matchDocs.map((m: any) => ({
            chunk_id: m.id,
            document_id: m.document_id || documentIds[0],
            chunk_text: m.chunk_text || m.content,
            slo_codes: m.slo_codes || [],
            metadata: m.metadata || {},
            combined_score: m.similarity || 0.8
          }));
        }
      } catch (e: any) {
        console.warn('⚠️ [Retriever] match_documents RPC unavailable:', e.message);
      }
    }

    // TIER 3: HYBRID_SEARCH_CHUNKS_V4 RPC
    if (queryEmbedding) {
      try {
        const { data: fallback, error: fallbackError } = await supabase.rpc('hybrid_search_chunks_v4', {
          query_text: query,
          query_embedding: queryEmbedding,
          match_count: matchCount, 
          filter_document_ids: documentIds
        });

        if (!fallbackError && fallback && fallback.length > 0) {
          return fallback.map((m: any) => ({
            chunk_id: m.id,
            document_id: m.document_id,
            chunk_text: m.chunk_text,
            slo_codes: m.slo_codes || [],
            metadata: m.metadata || {},
            combined_score: m.combined_score || 0.75
          }));
        }
      } catch (e: any) {
        console.warn('⚠️ [Retriever] hybrid_search_chunks_v4 RPC failed:', e.message);
      }
    }

    // TIER 4: DIRECT CLIENT-SIDE VECTOR COSINE SIMILARITY (PGVECTOR IN-MEMORY FALLBACK)
    if (queryEmbedding) {
      try {
        const { data: rawChunks } = await supabase
          .from('document_chunks')
          .select('id, document_id, chunk_text, slo_codes, metadata, embedding')
          .in('document_id', documentIds)
          .not('embedding', 'is', null)
          .limit(100);

        if (rawChunks && rawChunks.length > 0) {
          const scored = rawChunks
            .map((c: any) => {
              let vec: number[] = [];
              if (Array.isArray(c.embedding)) {
                vec = c.embedding;
              } else if (typeof c.embedding === 'string') {
                try {
                  vec = JSON.parse(c.embedding);
                } catch {
                  // pgvector string format: "[0.123, ...]"
                  vec = c.embedding.replace(/[\[\]]/g, '').split(',').map((v: string) => parseFloat(v));
                }
              }

              const sim = calculateCosineSimilarity(queryEmbedding!, vec);
              return {
                chunk_id: c.id,
                document_id: c.document_id,
                chunk_text: c.chunk_text,
                slo_codes: c.slo_codes || [],
                metadata: c.metadata || {},
                combined_score: sim
              };
            })
            .filter(c => c.combined_score > 0.3)
            .sort((a, b) => b.combined_score - a.combined_score)
            .slice(0, matchCount);

          if (scored.length > 0) {
            console.log(`🎯 [Retriever] Direct pgvector cosine matching yielded ${scored.length} results.`);
            return scored;
          }
        }
      } catch (e: any) {
        console.warn('⚠️ [Retriever] Direct pgvector cosine fallback encountered error:', e.message);
      }
    }

    // TIER 5: SLO CODE & SUBSTRING TEXT MATCHING
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
        return textMatches.map(c => ({
          chunk_id: c.id,
          document_id: c.document_id,
          chunk_text: c.chunk_text,
          slo_codes: c.slo_codes || [],
          metadata: c.metadata || {},
          combined_score: 0.95
        }));
      }
    }

    // TIER 6: BROAD KEYWORD SEARCH FALLBACK
    const queryTokens = query.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 3);
    if (queryTokens.length > 0) {
      const ilikeQuery = queryTokens.map(t => `chunk_text.ilike.%${t}%`).join(',');
      const { data: keywordChunks } = await supabase
        .from('document_chunks')
        .select('id, document_id, chunk_text, slo_codes, metadata')
        .in('document_id', documentIds)
        .or(ilikeQuery)
        .limit(matchCount);

      if (keywordChunks && keywordChunks.length > 0) {
        return keywordChunks.map(c => ({
          chunk_id: c.id,
          document_id: c.document_id,
          chunk_text: c.chunk_text,
          slo_codes: c.slo_codes || [],
          metadata: c.metadata || {},
          combined_score: 0.6
        }));
      }
    }

    return [];
  } catch (err) {
    console.error('❌ [Retriever] Critical Fault:', err);
    return [];
  }
}
