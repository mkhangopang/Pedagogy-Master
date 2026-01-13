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
  maxChunks: number = 10,
  priorityDocumentId?: string | null
): Promise<RetrievedChunk[]> {
  
  console.log(`🔍 [Retriever] Querying neural plane: "${query.substring(0, 40)}..."`);
  
  try {
    const sanitizedPriorityId = (priorityDocumentId && /^[0-9a-fA-F-]{36}$/.test(priorityDocumentId)) 
      ? priorityDocumentId 
      : null;

    // 1. Direct SLO High-Precision Search (Regex based)
    // Matches patterns like S8a5, M7b3, etc.
    const sloRegex = /\b([A-Z]\d{1,2}[a-z]\d{1,2}|[A-Z]-\d{1,2}-\d{1,2}|\d\.\d\.\d)\b/gi;
    const foundCodes = query.match(sloRegex);
    
    let directResults: RetrievedChunk[] = [];
    if (foundCodes && foundCodes.length > 0) {
      console.log(`🎯 [Retriever] High-precision SLO codes detected: ${foundCodes.join(', ')}`);
      
      const { data: sloChunks, error: sloError } = await supabase
        .from('document_chunks')
        .select('id, chunk_text, slo_codes, page_number')
        .in('document_id', documentIds)
        .contains('slo_codes', [foundCodes[0].toUpperCase()])
        .limit(5);

      if (!sloError && sloChunks && sloChunks.length > 0) {
        directResults = sloChunks.map(c => ({
          id: c.id,
          text: c.chunk_text,
          sloCodes: c.slo_codes || [],
          similarity: 1.0,
          pageNumber: c.page_number
        }));
      }
    }

    // 2. Semantic Analysis (Neural Embeddings)
    const queryEmbedding = await generateEmbedding(query);

    // 3. Hybrid Search Execution (Vector + Keyword)
    const { data, error } = await supabase.rpc('hybrid_search_chunks', {
      query_text: query,
      query_embedding: queryEmbedding, 
      match_count: maxChunks,
      filter_document_ids: documentIds,
      priority_document_id: sanitizedPriorityId
    });

    if (error) {
      console.error('❌ [Retriever RPC Error]:', error);
      return directResults;
    }

    // Combined results, prioritizing direct matches
    const semanticResults = (data || []).map((d: any) => ({
      id: d.chunk_id,
      text: d.chunk_text,
      sloCodes: d.slo_codes || [],
      similarity: d.combined_score,
      pageNumber: d.page_number,
      sectionTitle: d.section_title
    }));

    // Filter results with a lower threshold to be more inclusive
    // Many curriculum docs use unique wording that lowers standard similarity
    const filteredSemantic = semanticResults.filter((r: any) => r.similarity > 0.15);
    
    const allResults = [...directResults, ...filteredSemantic];
    
    // Remove duplicates by ID
    const uniqueResults = Array.from(new Map(allResults.map(item => [item.id, item])).values());
    
    console.log(`📡 [Retriever] Found ${uniqueResults.length} relevant curriculum segments.`);
    return uniqueResults.slice(0, maxChunks);

  } catch (err) {
    console.error('[Retriever Critical Path Error]:', err);
    return [];
  }
}