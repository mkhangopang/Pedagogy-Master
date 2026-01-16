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
 * HIGH-PRECISION SEMANTIC RETRIEVER (v18.5)
 * Optimized for curriculum standards with aggressive token boosting.
 * FIX: Strictly aligned with hybrid_search_chunks_v2 SQL signature.
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  matchCount: number = 12,
  priorityDocumentId?: string | null
): Promise<RetrievedChunk[]> {
  
  const sanitizedDocIds = Array.isArray(documentIds) ? documentIds : [documentIds];
  const sanitizedPriorityId = (priorityDocumentId && /^[0-9a-fA-F-]{36}$/.test(priorityDocumentId)) 
    ? priorityDocumentId 
    : null;

  console.log('📡 [RAG Retrieval Debug]:', {
    docCount: sanitizedDocIds.length,
    queryPreview: query.substring(0, 50),
    matchCount: matchCount,
    priorityId: sanitizedPriorityId
  });

  try {
    // 1. ADVANCED SLO TOKEN EXTRACTION
    const boostTags: string[] = [];
    const sloRegex = /([A-Z])[\s.-]?(\d{1,2})[\s.-]?([A-Z])[\s.-]?(\d{1,2})|(\d+\.\d+(?:\.\d+)?)/gi;
    const matches = Array.from(query.matchAll(sloRegex));
    
    matches.forEach(m => {
      boostTags.push(m[0].toUpperCase().replace(/[\s.-]/g, '')); // Normalized (S8C3)
      boostTags.push(m[0].toUpperCase()); // Verbatim (S8.C3)
    });

    const finalBoostTags = Array.from(new Set(boostTags.filter(t => t.length >= 2)));
    if (finalBoostTags.length > 0) {
      console.log(`🎯 [Retriever] Boosting SLO Tokens:`, finalBoostTags);
    }

    // 2. HYBRID VECTOR SEARCH
    // MODEL: text-embedding-004 (Confirmed 768 Dimensions)
    const queryEmbedding = await generateEmbedding(query);

    /**
     * CRITICAL FIX: The RPC parameters must strictly match the database function signature.
     * filter_document_ids MUST be an array of UUIDs (uuid[]).
     * All 5 parameters are explicitly passed.
     */
    const { data, error } = await supabase.rpc('hybrid_search_chunks_v2', {
      query_embedding: queryEmbedding,
      match_count: matchCount, 
      filter_document_ids: sanitizedDocIds, // uuid[]
      priority_document_id: sanitizedPriorityId, // uuid (optional)
      boost_tags: finalBoostTags || [] // text[] (optional)
    });

    if (error) {
      console.error('❌ [Retriever RPC Fail]:', {
        message: error.message,
        hint: error.hint,
        details: error.details,
        params: {
          filter_document_ids: sanitizedDocIds,
          match_count: matchCount,
          boost_tags: finalBoostTags
        }
      });
      return [];
    }

    const chunksFound = data?.length || 0;
    console.log(`✅ [Retriever] Chunks retrieved: ${chunksFound}`);
    
    if (chunksFound > 0) {
      console.log(`📊 [Retriever] High-Relevance Match:`, {
        slo: data[0].slo_codes,
        score: data[0].combined_score
      });
    }

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
