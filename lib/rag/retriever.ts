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
 * TIERED NEURAL RETRIEVER (v30.0)
 * Logic: Literal Match -> Hybrid Search -> Semantic Fallback.
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
      const normalizedPrimary = normalizeSLO(primaryCode);
      
      // Multi-Variant Literal Scan (Handles formatting variance in source PDFs)
      const variants = [
        normalizedPrimary,                             // B-11-B-27
        normalizedPrimary.replace(/-/g, ''),          // B11B27
        normalizedPrimary.replace(/-/g, ' '),         // B 11 B 27
        primaryCode                                   // Original Input
      ];

      // Execute literal scan across all selected documents
      const { data: literalMatches } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .or(`chunk_text.ilike.%${variants[0]}%,chunk_text.ilike.%${variants[1]}%,slo_codes.cs.{"${normalizedPrimary}"}`)
        .limit(15);

      if (literalMatches) {
        literalMatches.forEach(m => {
          resultsMap.set(m.id, {
            chunk_id: m.id,
            document_id: m.document_id,
            chunk_text: m.chunk_text,
            slo_codes: m.slo_codes || [],
            metadata: m.metadata || {},
            combined_score: 1.0, // Force top of results
            is_verbatim_definition: true
          });
        });
      }
    }

    // TIER 2: HYBRID NEURAL SEARCH (Semantic Meaning)
    // Only proceed if we haven't filled the context with literal hits
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
    console.error('❌ [Retriever] Fatal Sequence Failure:', err);
    return [];
  }
}