import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';

export interface RetrievedChunk {
  id: string;
  text: string;
  sloCodes: string[];
  similarity: number;
  sectionTitle?: string;
  pageNumber?: number;
}

/**
 * HIGH-PRECISION SEMANTIC RETRIEVER (v18.0)
 * Optimized for Sindh/International standards with aggressive token boosting.
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  maxChunks: number = 10,
  priorityDocumentId?: string | null
): Promise<RetrievedChunk[]> {
  
  console.log(`🔍 [Retriever] Scanning nodes for: "${query.substring(0, 50)}..."`);
  
  try {
    const sanitizedPriorityId = (priorityDocumentId && /^[0-9a-fA-F-]{36}$/.test(priorityDocumentId)) 
      ? priorityDocumentId 
      : null;

    // 1. ADVANCED SLO TOKEN EXTRACTION
    const boostTags: string[] = [];
    
    // Pattern: S8.C3, 8.1.2, S-04-A-03
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
    const queryEmbedding = await generateEmbedding(query);

    const { data, error } = await supabase.rpc('hybrid_search_chunks_v2', {
      query_embedding: queryEmbedding, 
      match_count: maxChunks,
      filter_document_ids: documentIds,
      priority_document_id: sanitizedPriorityId,
      boost_tags: finalBoostTags
    });

    if (error) {
      console.error('❌ [Retriever RPC Fail]:', error.message);
      // Fallback to simpler lookup if hybrid v2 fails or doesn't exist yet
      return [];
    }

    return (data || []).map((d: any) => ({
      id: d.chunk_id,
      text: d.chunk_text,
      sloCodes: d.slo_codes || [],
      similarity: d.combined_score,
      pageNumber: d.page_number,
      sectionTitle: d.section_title
    }));

  } catch (err) {
    console.error('[Retriever Critical Fatal]:', err);
    return [];
  }
}