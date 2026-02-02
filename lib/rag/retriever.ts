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
 * TIERED NEURAL RETRIEVER (v35.0)
 * Logic: Literal Locked -> Hybrid Semantic -> Global Fallback.
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

    const parsed = parseUserQuery(query);
    const resultsMap = new Map<string, RetrievedChunk>();
    
    // TIER 1: MULTI-VARIANT LITERAL LOCK
    if (parsed.sloCodes.length > 0) {
      const primaryCode = parsed.sloCodes[0];
      const normalized = normalizeSLO(primaryCode);
      
      // Variants: B-11-B-06, B11B06, B 11 B 06, etc.
      const variants = [
        normalized,
        normalized.replace(/-/g, ''),
        normalized.replace(/-/g, ' '),
        primaryCode
      ];

      // Scan for any literal occurrences in chunks
      const { data: literalMatches } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .or(`chunk_text.ilike.%${variants[0]}%,chunk_text.ilike.%${variants[1]}%,slo_codes.cs.{"${normalized}"}`)
        .limit(15);

      if (literalMatches) {
        literalMatches.forEach(m => {
          resultsMap.set(m.id, {
            chunk_id: m.id,
            document_id: m.document_id,
            chunk_text: m.chunk_text,
            slo_codes: m.slo_codes || [],
            metadata: m.metadata || {},
            combined_score: 1.0, // Hard-Lock priority
            is_verbatim_definition: true
          });
        });
      }
    }

    // TIER 2: NEURAL SEMANTIC SEARCH
    if (resultsMap.size < 5) {
      const queryEmbedding = await generateEmbedding(query);
      const { data: hybridChunks, error: rpcError } = await supabase.rpc('hybrid_search_chunks_v4', {
        query_text: query,
        query_embedding: queryEmbedding,
        match_count: matchCount, 
        filter_document_ids: documentIds,
        full_text_weight: 0.3,
        vector_weight: 0.7
      });

      if (!rpcError && hybridChunks) {
        hybridChunks.forEach((m: any) => {
          if (!resultsMap.has(m.id)) {
            resultsMap.set(m.id, {
              chunk_id: m.id,
              document_id: m.document_id,
              chunk_text: m.chunk_text,
              slo_codes: m.slo_codes || [],
              metadata: m.metadata || {},
              combined_score: m.combined_score || 0.5,
              is_verbatim_definition: false
            });
          }
        });
      }
    }

    return Array.from(resultsMap.values())
      .sort((a, b) => (b.is_verbatim_definition ? 1 : 0) - (a.is_verbatim_definition ? 1 : 0) || b.combined_score - a.combined_score)
      .slice(0, 35);

  } catch (err) {
    console.error('❌ [Retriever] Critical Fault:', err);
    return [];
  }
}