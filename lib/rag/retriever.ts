import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

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
 * HIGH-FIDELITY RETRIEVER (v12.5)
 * Specialized for Curriculum Anchoring.
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

    // 1. HARD-ANCHOR: Exact SLO Matches (Pedagogical Priority)
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
            combined_score: 1.0, // Absolute weight for exact standard matches
            is_verbatim_definition: m.metadata?.is_slo_definition || false,
            section_title: m.metadata?.sectionTitle || m.metadata?.standard || m.metadata?.title || 'General',
            page_number: m.metadata?.pageNumber || 0
          });
        });
      }
    }

    // 2. SEMANTIC LAYER: Neural vector search for conceptual relevance
    const queryEmbedding = await generateEmbedding(query);
    const { data: semanticChunks, error: rpcError } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_text: query,
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
          is_verbatim_definition: m.metadata?.is_slo_definition || false,
          section_title: m.metadata?.sectionTitle || m.metadata?.standard || m.metadata?.title || 'General',
          page_number: m.metadata?.pageNumber || 0
        });
      }
    });

    // 3. CONTEXTUAL SYNTHESIS: Format chunks with their structural hierarchy
    return Array.from(resultsMap.values())
      .sort((a, b) => b.combined_score - a.combined_score)
      .slice(0, 20)
      .map(chunk => {
        const meta = chunk.metadata;
        const prefix = meta.domain ? `[CONTEXT: ${meta.domain} > ${meta.benchmark || 'General'}]\n` : "";
        return {
          ...chunk,
          chunk_text: prefix + chunk.chunk_text
        };
      });
  } catch (err) {
    console.error('❌ [Retriever] Fault detected in neural vault:', err);
    return [];
  }
}