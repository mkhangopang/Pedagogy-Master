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
  // Add comment above each fix
  // Fix: Added optional page_number property to interface to support document-specific retrieval UI
  page_number?: number | null;
}

/**
 * ATOMIC RAG RETRIEVER (v52.0)
 * Logic: Hard Match > Semantic Match
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
    const requestedGrade = targetCodes.length > 0 ? extractGradeFromSLO(targetCodes[0]) : null;

    // 1. HARD LOOKUP: Search for exact SLO codes in the database tags
    let hardMatches: any[] = [];
    if (targetCodes.length > 0) {
      const { data } = await supabase
        .from('document_chunks')
        .select('*')
        .in('document_id', documentIds)
        .overlaps('slo_codes', targetCodes);
      
      if (data) hardMatches = data.map(d => ({ ...d, is_verbatim_definition: true }));
    }

    // 2. SEMANTIC LOOKUP: Contextual search
    const queryEmbedding = await generateEmbedding(query);
    const { data: semanticChunks } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount, 
      filter_document_ids: documentIds,
      filter_grades: requestedGrade ? [requestedGrade] : null
    });

    // 3. MERGE & DEDUPLICATE
    const resultsMap = new Map<string, RetrievedChunk>();

    // Priority 1: Exact SLO tag matches
    hardMatches.forEach(m => {
      resultsMap.set(m.id, {
        chunk_id: m.id,
        document_id: m.document_id,
        chunk_text: m.chunk_text,
        slo_codes: m.slo_codes || [],
        section_title: m.metadata?.unit_name || 'Curriculum Objective',
        combined_score: 1.0,
        is_verbatim_definition: true,
        grade_levels: m.grade_levels,
        // Add comment above each fix
        // Fix: Pass page_number from metadata if available to satisfy RetrievedChunk interface
        page_number: m.metadata?.page_number ?? m.page_number
      });
    });

    // Priority 2: Semantic relevance
    (semanticChunks || []).forEach((m: any) => {
      const cid = m.id || m.chunk_id;
      if (!resultsMap.has(cid)) {
        resultsMap.set(cid, {
          chunk_id: cid,
          document_id: m.document_id,
          chunk_text: m.chunk_text,
          slo_codes: m.slo_codes || [],
          section_title: m.metadata?.section_title || m.unit_name,
          combined_score: m.combined_score || 0.5,
          is_verbatim_definition: false,
          grade_levels: m.grade_levels,
          // Add comment above each fix
          // Fix: Pass page_number from metadata or root if available to satisfy RetrievedChunk interface
          page_number: m.metadata?.page_number ?? m.page_number
        });
      }
    });

    return Array.from(resultsMap.values()).slice(0, 15);
  } catch (err) {
    console.error('❌ [Retriever] Vault Match Error:', err);
    return [];
  }
}