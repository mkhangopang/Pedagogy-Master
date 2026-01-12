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
 * SEMANTIC RETRIEVER
 * Pulls the most relevant curriculum "memories" based on user query vector.
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  maxChunks: number = 8,
  priorityDocumentId?: string | null
): Promise<RetrievedChunk[]> {
  
  console.log(`🔍 [Retriever] Semantic lookup for: "${query.substring(0, 50)}..."`);
  
  try {
    // 1. Sanitize priority ID for Supabase RPC (must be valid UUID or null)
    const sanitizedPriorityId = (priorityDocumentId && priorityDocumentId.length === 36) 
      ? priorityDocumentId 
      : null;

    // 2. Check for direct SLO code match (High Precision Fallback)
    const sloPattern = /\b([A-Z])(\d{1,2})([a-z])(\d{1,2})\b/i;
    const sloMatch = query.match(sloPattern);
    
    if (sloMatch) {
      const sloCode = sloMatch[0].toUpperCase();
      const { data: sloChunks } = await supabase.rpc('find_slo_chunks', {
        slo_code: sloCode,
        document_ids: documentIds
      });
      
      if (sloChunks && sloChunks.length > 0) {
        console.log(`🎯 [Retriever] Direct SLO match found: ${sloCode}`);
        return sloChunks.map((d: any) => ({
          id: d.chunk_id,
          text: d.chunk_text,
          sloCodes: [sloCode],
          similarity: 1.0,
          pageNumber: d.page_number
        }));
      }
    }

    // 3. Generate Query Embedding for Semantic Search
    const queryEmbedding = await generateEmbedding(query);

    // 4. Persistent Vector Search (pgvector)
    const { data, error } = await supabase.rpc('hybrid_search_chunks', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: maxChunks,
      filter_document_ids: documentIds,
      priority_document_id: sanitizedPriorityId
    });

    if (error) {
      console.error('[Retriever RPC Error]:', error);
      // Fallback: If vector search fails, try keyword search
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
    console.error('[Retriever Fatal Failure]:', err);
    return [];
  }
}
