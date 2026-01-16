import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';

export interface RetrievedChunk {
  chunk_id: string;
  chunk_text: string;
  slo_codes: string[];
  combined_score: number;
  section_title?: string;
  page_number?: number;
}

/**
 * NEURAL SLO PARSER
 * Extracts and normalizes curriculum codes (e.g., S8A5, S-08-A-05 -> S8A5) 
 * to enable high-precision tag boosting in PostgreSQL.
 */
export function extractSLOCodes(query: string): string[] {
  // Pattern: S8A5, S-08-A-05, S8a5, 8.1.2, G-IV-A-01, etc.
  const sloRegex = /S-?\d{1,2}-?[A-Za-z]-?[\s.-]?\d{1,2}|(\d+\.\d+(?:\.\d+)?)|[A-Z]-[IVXLCDM]+-[A-Z]-\d{1,2}/gi;
  const matches = query.match(sloRegex) || [];
  
  // Normalize to alphanumeric uppercase for cross-referencing the vector grid
  return Array.from(new Set(matches.map(m => m.toUpperCase().replace(/[\s.-]/g, ''))));
}

/**
 * HIGH-PRECISION TOOL-FACTORY RETRIEVER (v18.8)
 * Optimized to find the specific SLO "seed" needed for pedagogical synthesis.
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  matchCount: number = 8, // Focused retrieval for tool seeds
  priorityDocumentId?: string | null
): Promise<RetrievedChunk[]> {
  
  const sanitizedDocIds = Array.isArray(documentIds) ? documentIds : [documentIds];
  const sanitizedPriorityId = (priorityDocumentId && /^[0-9a-fA-F-]{36}$/.test(priorityDocumentId)) 
    ? priorityDocumentId 
    : null;

  // 1. EXTRACT BOOST TAGS (The most critical step for Tool Factory logic)
  const extractedSLOs = extractSLOCodes(query);
  
  console.log('📡 [RAG Retrieval Debug]:', {
    docCount: sanitizedDocIds.length,
    queryPreview: query.substring(0, 50),
    boostTags: extractedSLOs,
    matchCount: matchCount
  });

  try {
    // 2. HYBRID VECTOR SEARCH
    const queryEmbedding = await generateEmbedding(query);

    /**
     * NEURAL ENGINE CALL:
     * boost_tags ensures chunks explicitly tagged with the user's SLO 
     * (e.g. S8A5) rise to the top, regardless of semantic similarity.
     */
    const { data, error } = await supabase.rpc('hybrid_search_chunks_v2', {
      query_embedding: queryEmbedding,
      match_count: matchCount, 
      filter_document_ids: sanitizedDocIds,
      priority_document_id: sanitizedPriorityId,
      boost_tags: extractedSLOs 
    });

    if (error) {
      console.error('❌ [Retriever RPC Fail]:', error.message);
      return [];
    }

    const chunksFound = data?.length || 0;
    console.log(`✅ [Retriever] Sync complete. ${chunksFound} nodes extracted.`);
    
    return (data || []).map((d: any) => ({
      chunk_id: d.chunk_id,
      chunk_text: d.chunk_text,
      slo_codes: d.slo_codes || [],
      combined_score: d.combined_score,
      page_number: d.page_number,
      section_title: d.section_title
    }));

  } catch (err) {
    console.error('[Retriever Critical Fatal]:', err);
    return [];
  }
}