import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { extractSLOCodes, extractGradeFromSLO } from './slo-extractor';

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  chunk_text: string;
  slo_codes: string[];
  section_title: string | null;
  combined_score: number | null;
  grade_levels?: string[];
  is_verbatim_definition?: boolean;
  page_number?: number | null;
}

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

    // 1. ULTRA-HARD LOCK: Check tagged SLO codes array
    if (targetCodes.length > 0) {
      const { data: tagMatches } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .overlaps('slo_codes', targetCodes);
      
      if (tagMatches) {
        tagMatches.forEach(m => {
          resultsMap.set(m.id, {
            chunk_id: m.id, document_id: m.document_id, chunk_text: m.chunk_text,
            slo_codes: m.slo_codes || [], section_title: 'Curriculum Standard',
            combined_score: 1.0, is_verbatim_definition: true
          });
        });
      }

      // 2. TEXT-SEARCH FALLBACK: If tags failed, look for the text "S-05-C-04" directly in text
      if (resultsMap.size === 0) {
        const { data: textMatches } = await supabase
          .from('document_chunks')
          .select('*')
          .in('document_id', documentIds)
          .ilike('chunk_text', `%${targetCodes[0]}%`);

        if (textMatches) {
          textMatches.forEach(m => {
            resultsMap.set(m.id, {
              chunk_id: m.id, document_id: m.document_id, chunk_text: m.chunk_text,
              slo_codes: m.slo_codes || [], section_title: 'Text Match',
              combined_score: 0.9, is_verbatim_definition: true
            });
          });
        }
      }
    }

    // 3. SEMANTIC SEARCH (General Context)
    const queryEmbedding = await generateEmbedding(query);
    const { data: semanticChunks } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount, 
      filter_document_ids: documentIds
    });

    (semanticChunks || []).forEach((m: any) => {
      const cid = m.id || m.chunk_id;
      if (!resultsMap.has(cid)) {
        resultsMap.set(cid, {
          chunk_id: cid, document_id: m.document_id, chunk_text: m.chunk_text,
          slo_codes: m.slo_codes || [], section_title: m.metadata?.unit_name,
          combined_score: m.combined_score || 0.5, is_verbatim_definition: false
        });
      }
    });

    return Array.from(resultsMap.values()).slice(0, 15);
  } catch (err) {
    console.error('❌ [Retriever] Vault Match Error:', err);
    return [];
  }
}
