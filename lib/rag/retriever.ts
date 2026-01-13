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
  
  console.log(`🔍 [Retriever] Querying neural plane: "${query.substring(0, 40)}..."`);
  
  try {
    const sanitizedPriorityId = (priorityDocumentId && /^[0-9a-fA-F-]{36}$/.test(priorityDocumentId)) 
      ? priorityDocumentId 
      : null;

    // 1. Direct SLO High-Precision Search
    const sloMatch = query.match(/\b([A-Z]?)(\d{1,2})([a-z]?)(\d{1,2})\b/i);
    if (sloMatch) {
      const sloCode = sloMatch[0].toUpperCase();
      const { data: sloChunks, error: sloError } = await supabase.rpc('find_slo_chunks', {
        slo_code: sloCode,
        document_ids: documentIds
      });
      
      if (sloError) {
        console.error('❌ [Retriever SLO Search Error]:', sloError);
      } else if (sloChunks && sloChunks.length > 0) {
        console.log(`🎯 [Retriever] Direct SLO Match Found: ${sloCode}`);
        return sloChunks.map((d: any) => ({
          id: d.chunk_id,
          text: d.chunk_text,
          sloCodes: [sloCode],
          similarity: 1.0,
          pageNumber: d.page_number
        }));
      }
    }

    // 2. Semantic Analysis (Neural Embeddings)
    // Send as standard number array
    const queryEmbedding = await generateEmbedding(query);

    // 3. Hybrid Search Execution
    const { data, error } = await supabase.rpc('hybrid_search_chunks', {
      query_text: query,
      query_embedding: queryEmbedding, 
      match_count: maxChunks,
      filter_document_ids: documentIds,
      priority_document_id: sanitizedPriorityId
    });

    if (error) {
      console.error('❌ [Retriever RPC Node Error]:', error);
      // Log specific hint for type mismatch
      if (error.message?.includes('vector') && error.message?.includes('json')) {
        console.error('CRITICAL: Retrieval failed due to type mismatch in document_chunks.embedding. Run SQL Patch v12.0.');
      }
      return [];
    }

    // Inclusive threshold (0.35) to handle specific curriculum naming variants
    const filtered = (data || []).filter((d: any) => d.combined_score > 0.35); 
    console.log(`📡 [Retriever] Found ${filtered.length} relevant curriculum segments.`);

    return filtered.map((d: any) => ({
      id: d.chunk_id,
      text: d.chunk_text,
      sloCodes: d.slo_codes || [],
      similarity: d.combined_score,
      pageNumber: d.page_number,
      sectionTitle: d.section_title
    }));
  } catch (err) {
    console.error('[Retriever Critical Path Error]:', err);
    return [];
  }
}