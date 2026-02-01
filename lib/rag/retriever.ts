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
 * WORLD-CLASS NEURAL RETRIEVER (v13.0)
 * Optimized with Query Expansion and SLO Relational Enrichment.
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

    // 1. RELATIONAL ENRICHMENT (Query Expansion)
    // If we identify an SLO code, fetch its text from the relational DB to improve semantic lookup
    if (targetCodes.length > 0) {
      const { data: dbMatches } = await supabase
        .from('slo_database')
        .select('slo_full_text')
        .in('slo_code', targetCodes)
        .in('document_id', documentIds)
        .limit(1);
      
      if (dbMatches && dbMatches[0]?.slo_full_text) {
        expandedQuery = `${query} ${dbMatches[0].slo_full_text}`;
        console.log(`🧠 [Retriever] Query Expansion Active: + ${dbMatches[0].slo_full_text.substring(0, 30)}...`);
      }
    }

    // 2. HARD-ANCHOR: Tag Matching
    if (targetCodes.length > 0) {
      const { data: tagMatches } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .overlaps('slo_codes', targetCodes);
      
      if (tagMatches) {
        tagMatches.forEach(m => {
          resultsMap.set(m.id, {
            chunk_id: m.id,
            document_id: m.document_id,
            chunk_text: m.chunk_text,
            slo_codes: m.slo_codes || [],
            metadata: m.metadata || {},
            combined_score: 1.5, // Boosted score for exact standard reference
            is_verbatim_definition: m.metadata?.is_slo_definition || false
          });
        });
      }
    }

    // 3. SEMANTIC LAYER: Neural Vector Search
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
      if (!resultsMap.has(cid)) {
        resultsMap.set(cid, {
          chunk_id: cid,
          document_id: m.document_id,
          chunk_text: m.chunk_text,
          slo_codes: m.slo_codes || [],
          metadata: m.metadata || {},
          combined_score: m.combined_score || 0.5,
          is_verbatim_definition: m.metadata?.is_slo_definition || false
        });
      } else {
        // If already in map from exact match, boost score with semantic relevance
        const existing = resultsMap.get(cid)!;
        existing.combined_score += (m.combined_score || 0);
      }
    });

    // 4. CROSS-LINKING RECOVERY
    // If zero results found for a code, try searching for the "normalized" variant specifically
    if (resultsMap.size === 0 && targetCodes.length > 0) {
      console.log("🔍 [Retriever] Initial search failed. Attempting Normalized Grid Recovery...");
      const normalized = targetCodes.map(c => normalizeSLO(c));
      const { data: fallback } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .overlaps('slo_codes', normalized);
      
      if (fallback) {
        fallback.forEach(m => {
          resultsMap.set(m.id, {
            chunk_id: m.id,
            document_id: m.document_id,
            chunk_text: m.chunk_text,
            slo_codes: m.slo_codes || [],
            metadata: m.metadata || {},
            combined_score: 1.0,
            is_verbatim_definition: true
          });
        });
      }
    }

    return Array.from(resultsMap.values())
      .sort((a, b) => b.combined_score - a.combined_score)
      .slice(0, 20);

  } catch (err) {
    console.error('❌ [Retriever] Neural Vault Exception:', err);
    return [];
  }
}
