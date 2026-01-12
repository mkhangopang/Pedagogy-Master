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
 * HYBRID NEURAL RETRIEVER
 * Fetches relevant curriculum context from the persistent Supabase vector store.
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  maxChunks: number = 8,
  priorityDocumentId?: string
): Promise<RetrievedChunk[]> {
  
  console.log(`🔍 [Retriever] Initializing neural lookup for: "${query.substring(0, 50)}..."`);
  
  try {
    // 1. Check for explicit SLO codes (Highest precision)
    const sloPattern = /\b([A-Z])(\d{1,2})([a-z])(\d{1,2})\b/i;
    const sloMatch = query.match(sloPattern);
    
    if (sloMatch) {
      const sloCode = sloMatch[0].toUpperCase();
      console.log(`🎯 [Retriever] Priority SLO match: ${sloCode}`);
      const results = await retrieveChunksForSLO(sloCode, documentIds, supabase);
      if (results.length > 0) return results;
    }

    // 2. Generate Query Embedding for Semantic Search
    console.log(`✨ [Retriever] Generating query vector...`);
    const queryEmbedding = await generateEmbedding(query);

    // 3. Execute Hybrid Search RPC (Vector Similarity + Full-Text Rank)
    const { data, error } = await supabase.rpc('hybrid_search_chunks', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: maxChunks,
      filter_document_ids: documentIds,
      priority_document_id: priorityDocumentId || null
    });

    if (error) {
      console.error('[Retriever RPC Error]:', error);
      return [];
    }

    console.log(`✅ [Retriever] Retrieved ${data?.length || 0} semantic matches.`);

    return (data || []).map((d: any) => ({
      id: d.chunk_id,
      text: d.chunk_text,
      sloCodes: d.slo_codes || [],
      similarity: d.combined_score,
      pageNumber: d.page_number,
      sectionTitle: d.section_title
    }));
  } catch (err) {
    console.error('[Retriever Fatal]:', err);
    return [];
  }
}

/**
 * SLO DIRECT LOOKUP (Fallback for exact code queries)
 */
export async function retrieveChunksForSLO(
  sloCode: string,
  documentIds: string[],
  supabase: SupabaseClient
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase.rpc('find_slo_chunks', {
    slo_code: sloCode.toUpperCase(),
    document_ids: documentIds
  });

  if (error) return [];

  return (data || []).map((d: any) => ({
    id: d.chunk_id,
    text: d.chunk_text,
    sloCodes: [sloCode.toUpperCase()],
    similarity: 1.0,
    pageNumber: d.page_number
  }));
}
