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
 * TIERED NEURAL RETRIEVER (v28.0)
 * Precision-tuned for Sindh 2024 and FBISE Standards.
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
    
    // TIER 1: TRIPLE-LOCK LITERAL SEARCH
    if (parsed.sloCodes.length > 0) {
      const primaryCode = parsed.sloCodes[0];
      
      // A. Exact Array Match
      const { data: arrayMatches } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .overlaps('slo_codes', parsed.sloCodes);
      
      // B. Multi-Variant Text Search (Handles spaces, missing hyphens, etc.)
      const variants = [
        primaryCode,                                  // B-11-B-27
        primaryCode.replace(/-/g, ''),               // B11B27
        primaryCode.replace(/-/g, ' '),              // B 11 B 27
        primaryCode.replace(/SLO[:\s]*/i, '')        // Strip SLO prefix if present
      ];

      for (const variant of variants) {
        const { data: textMatches } = await supabase
          .from('document_chunks')
          .select('*')
          .in('document_id', documentIds)
          .ilike('chunk_text', `%${variant}%`)
          .limit(10);
        
        if (textMatches) {
            textMatches.forEach(m => {
                resultsMap.set(m.id, {
                    chunk_id: m.id,
                    document_id: m.document_id,
                    chunk_text: m.chunk_text,
                    slo_codes: m.slo_codes || [],
                    metadata: m.metadata || {},
                    combined_score: 10.0, // Absolute priority for literal hits
                    is_verbatim_definition: true
                });
            });
        }
      }

      if (arrayMatches) {
        arrayMatches.forEach(m => {
          resultsMap.set(m.id, {
            chunk_id: m.id,
            document_id: m.document_id,
            chunk_text: m.chunk_text,
            slo_codes: m.slo_codes || [],
            metadata: m.metadata || {},
            combined_score: 10.0,
            is_verbatim_definition: true
          });
        });
      }
    }

    // TIER 2: HYBRID NEURAL SEARCH (Semantic Meaning)
    // Only fetch if we don't have enough literal hits
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
      .sort((a, b) => b.combined_score - a.combined_score)
      .slice(0, 35);

  } catch (err) {
    console.error('❌ [Retriever] Grid Search Failure:', err);
    return [];
  }
}