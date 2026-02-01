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
  section_title?: string;
  page_number?: number;
}

/**
 * WORLD-CLASS NEURAL RETRIEVER (v14.0)
 * Optimized with Query Expansion and Relational Handshakes.
 */
export async function retrieveRelevantChunks({
  query,
  documentIds,
  supabase,
  matchCount = 40
}: {
  query: string;
  documentIds: string[];
  supabase: SupabaseClient;
  matchCount?: number;
}): Promise<RetrievedChunk[]> {
  try {
    if (!documentIds || documentIds.length === 0) return [];

    const targetCodes = extractSLOCodes(query);
    const resultsMap = new Map<string, RetrievedChunk>();
    let expandedQuery = query;

    // 1. RELATIONAL ENRICHMENT
    if (targetCodes.length > 0) {
      const { data: dbMatches } = await supabase
        .from('slo_database')
        .select('slo_full_text')
        .in('slo_code', targetCodes)
        .in('document_id', documentIds)
        .limit(1);
      
      if (dbMatches && dbMatches[0]?.slo_full_text) {
        expandedQuery = `${query} ${dbMatches[0].slo_full_text}`;
      }
    }

    // 2. HARD-ANCHOR: Tag Matching (Using ANY for broad support)
    if (targetCodes.length > 0) {
      // Primary search for exact matches
      const { data: tagMatches } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .filter('slo_codes', 'cs', `{${targetCodes.join(',')}}`); // Contains
      
      if (tagMatches) {
        tagMatches.forEach(m => {
          resultsMap.set(m.id, {
            chunk_id: m.id,
            document_id: m.document_id,
            chunk_text: m.chunk_text,
            slo_codes: m.slo_codes || [],
            metadata: m.metadata || {},
            combined_score: 2.0, // High-fidelity weight
            is_verbatim_definition: m.metadata?.is_slo_definition || false
          });
        });
      }
    }

    // 3. SEMANTIC LAYER
    const queryEmbedding = await generateEmbedding(expandedQuery);
    const { data: semanticChunks, error: rpcError } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_text: expandedQuery,
      query_embedding: queryEmbedding,
      match_count: matchCount, 
      filter_document_ids: documentIds
    });

    if (rpcError) throw rpcError;

    (semanticChunks || []).forEach((m: any) => {
      const cid = m.id || m.chunk_id;
      const score = m.combined_score || 0.5;
      
      if (!resultsMap.has(cid)) {
        resultsMap.set(cid, {
          chunk_id: cid,
          document_id: m.document_id,
          chunk_text: m.chunk_text,
          slo_codes: m.slo_codes || [],
          metadata: m.metadata || {},
          combined_score: score,
          is_verbatim_definition: m.metadata?.is_slo_definition || false
        });
      } else {
        const existing = resultsMap.get(cid)!;
        existing.combined_score += score;
      }
    });

    return Array.from(resultsMap.values())
      .sort((a, b) => b.combined_score - a.combined_score)
      .slice(0, 25);

  } catch (err) {
    console.error('❌ [Retriever] Grid Exception:', err);
    return [];
  }
}