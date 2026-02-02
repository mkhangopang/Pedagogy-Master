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
 * TIERED NEURAL RETRIEVER (v25.0)
 * Designed for 100% fidelity in Alphanumeric Curriculum Retrieval.
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
    
    // TIER 1: LITERAL SLO ANCHOR (Bypasses Vector "Guessing")
    if (parsed.sloCodes.length > 0) {
      const { data: literalMatches } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .overlaps('slo_codes', parsed.sloCodes);
      
      if (literalMatches) {
        literalMatches.forEach(m => {
          resultsMap.set(m.id, {
            chunk_id: m.id,
            document_id: m.document_id,
            chunk_text: m.chunk_text,
            slo_codes: m.slo_codes || [],
            metadata: m.metadata || {},
            combined_score: 10.0, // Absolute priority
            is_verbatim_definition: true
          });
        });
      }
    }

    // TIER 2: FUZZY LEXICAL SCAN (ILIKE fallback for alphanumeric variants)
    const codesToScan = parsed.sloCodes.map(c => `%${c.replace(/-/g, '')}%`);
    if (codesToScan.length > 0) {
        // Direct DB text search for variants like "S8C3" when doc says "S-08-C-03"
        for (const pattern of codesToScan) {
            const { data: textMatches } = await supabase
                .from('document_chunks')
                .select('*')
                .in('document_id', documentIds)
                .ilike('chunk_text', pattern)
                .limit(5);
            
            textMatches?.forEach(m => {
                if (!resultsMap.has(m.id)) {
                    resultsMap.set(m.id, {
                        chunk_id: m.id,
                        document_id: m.document_id,
                        chunk_text: m.chunk_text,
                        slo_codes: m.slo_codes || [],
                        metadata: m.metadata || {},
                        combined_score: 8.0,
                        is_verbatim_definition: true
                    });
                }
            });
        }
    }

    // TIER 3: HYBRID NEURAL SEARCH (Semantic Meaning)
    const queryEmbedding = await generateEmbedding(query);
    
    // Apply Metadata Filters to RPC if possible
    const { data: hybridChunks, error: rpcError } = await supabase.rpc('hybrid_search_chunks_v4', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount, 
      filter_document_ids: documentIds,
      full_text_weight: 0.4,
      vector_weight: 0.6
    });

    if (!rpcError && hybridChunks) {
      hybridChunks.forEach((m: any) => {
        if (!resultsMap.has(m.id)) {
          // Weight semantic matches based on Grade/Subject alignment
          let boost = 0;
          if (parsed.grades.includes(m.metadata?.grade_level)) boost += 0.2;
          if (parsed.subjectHint && m.metadata?.subject?.toLowerCase().includes(parsed.subjectHint)) boost += 0.2;

          resultsMap.set(m.id, {
            chunk_id: m.id,
            document_id: m.document_id,
            chunk_text: m.chunk_text,
            slo_codes: m.slo_codes || [],
            metadata: m.metadata || {},
            combined_score: (m.combined_score || 0.5) + boost,
            is_verbatim_definition: false
          });
        }
      });
    }

    return Array.from(resultsMap.values())
      .sort((a, b) => b.combined_score - a.combined_score)
      .slice(0, 30);

  } catch (err) {
    console.error('❌ [Retriever] High-Fidelity Retrieval Failure:', err);
    return [];
  }
}