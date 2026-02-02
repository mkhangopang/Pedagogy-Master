
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
 * TIERED NEURAL RETRIEVER (v36.0)
 * Logic: Literal Locked -> Hybrid Semantic -> Global Fallback.
 * FIX: Aggressive OCR-resilient literal matching.
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
    
    // TIER 1: MULTI-VARIANT LITERAL LOCK (Audit Fix)
    if (parsed.sloCodes.length > 0) {
      for (const primaryCode of parsed.sloCodes) {
        const normalized = normalizeSLO(primaryCode);
        
        // Variants for OCR resilience: B-11-B-06, B11B06, SL0-B-11-B-06
        const variants = [
          normalized,
          normalized.replace(/-/g, ''),
          normalized.replace(/O/g, '0'),
          normalized.replace(/0/g, 'O'),
          primaryCode.toUpperCase()
        ];

        // Construct ILIKE filter for variants
        const filterOr = variants.map(v => `chunk_text.ilike.%${v}%`).join(',');
        
        const { data: literalMatches } = await supabase
          .from('document_chunks')
          .select('*')
          .in('document_id', documentIds)
          .or(`${filterOr},slo_codes.cs.{"${normalized}"}`)
          .limit(20);

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
    }

    // TIER 2: NEURAL SEMANTIC SEARCH (Hybrid Scaling)
    if (resultsMap.size < matchCount) {
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
      .sort((a, b) => {
        // Verbatim definitions always float to the top
        if (a.is_verbatim_definition && !b.is_verbatim_definition) return -1;
        if (!a.is_verbatim_definition && b.is_verbatim_definition) return 1;
        return b.combined_score - a.combined_score;
      })
      .slice(0, matchCount);

  } catch (err) {
    console.error('❌ [Retriever] Critical Fault:', err);
    return [];
  }
}
