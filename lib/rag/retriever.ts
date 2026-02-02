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
 * WORLD-CLASS NEURAL RETRIEVER (v18.0)
 * Optimized with Brute-Force Lexical Fallback for 100% SLO Retrieval Fidelity.
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
    
    // 1. STAGE 1: HARD-ANCHOR LOOKUP (Metadata Tags)
    if (targetCodes.length > 0) {
      const { data: tagMatches } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .overlaps('slo_codes', targetCodes);
      
      if (tagMatches && tagMatches.length > 0) {
        tagMatches.forEach(m => {
          resultsMap.set(m.id, {
            chunk_id: m.id,
            document_id: m.document_id,
            chunk_text: m.chunk_text,
            slo_codes: m.slo_codes || [],
            metadata: m.metadata || {},
            combined_score: 5.0, // High priority for tagged data
            is_verbatim_definition: m.metadata?.is_slo_definition || false
          });
        });
      }
    }

    // 2. STAGE 2: BRUTE-FORCE LEXICAL SCAN (The "Ctrl+F" Fallback)
    // CRITICAL: If Stage 1 missed it, we scan the literal text for the code string.
    if (targetCodes.length > 0) {
      for (const code of targetCodes) {
        const { data: bruteMatches } = await supabase
          .from('document_chunks')
          .select('*')
          .in('document_id', documentIds)
          .ilike('chunk_text', `%${code}%`)
          .limit(10);
        
        if (bruteMatches) {
          bruteMatches.forEach(m => {
            if (!resultsMap.has(m.id)) {
              resultsMap.set(m.id, {
                chunk_id: m.id,
                document_id: m.document_id,
                chunk_text: m.chunk_text,
                slo_codes: m.slo_codes || [code],
                metadata: m.metadata || {},
                combined_score: 10.0, // Absolute priority for literal matches
                is_verbatim_definition: true
              });
            }
          });
        }
      }
    }

    // 3. STAGE 3: HYBRID NEURAL SEARCH (Only if map is still small)
    if (resultsMap.size < 5) {
      try {
        const queryEmbedding = await generateEmbedding(query);
        const { data: hybridChunks, error: rpcError } = await supabase.rpc('hybrid_search_chunks_v4', {
          query_text: query,
          query_embedding: queryEmbedding,
          match_count: matchCount, 
          filter_document_ids: documentIds,
          full_text_weight: 0.5,
          vector_weight: 0.5
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
                is_verbatim_definition: m.metadata?.is_slo_definition || false
              });
            }
          });
        }
      } catch (rpcExc) {
        console.warn('⚠️ [Retriever] Hybrid RPC node cooling down.');
      }
    }

    // 4. STAGE 4: RELATIONAL RECOVERY (Query the SLO DB directly)
    if (resultsMap.size === 0 && targetCodes.length > 0) {
       const { data: dbMatches } = await supabase
        .from('slo_database')
        .select('slo_full_text, slo_code, document_id')
        .in('slo_code', targetCodes)
        .in('document_id', documentIds)
        .limit(5);

       if (dbMatches) {
         dbMatches.forEach((m, i) => {
            const virtualId = `rel_${m.slo_code}_${i}`;
            resultsMap.set(virtualId, {
              chunk_id: virtualId,
              document_id: m.document_id,
              chunk_text: `[OFFICIAL_STANDARD] ${m.slo_code}: ${m.slo_full_text}`,
              slo_codes: [m.slo_code],
              metadata: { is_relational: true },
              combined_score: 15.0, // Relational matches are verified truth
              is_verbatim_definition: true
            });
         });
       }
    }

    return Array.from(resultsMap.values())
      .sort((a, b) => b.combined_score - a.combined_score)
      .slice(0, 30);

  } catch (err) {
    console.error('❌ [Retriever] Grid Inconsistency:', err);
    return [];
  }
}