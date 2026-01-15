
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
 * SEMANTIC RETRIEVER (v5.0 - ULTRA FLEXIBLE)
 * Optimized for high-recall curriculum grounding.
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  maxChunks: number = 10,
  priorityDocumentId?: string | null
): Promise<RetrievedChunk[]> {
  
  console.log(`🔍 [Retriever] Neural Scan: "${query.substring(0, 50)}..."`);
  
  try {
    const sanitizedPriorityId = (priorityDocumentId && /^[0-9a-fA-F-]{36}$/.test(priorityDocumentId)) 
      ? priorityDocumentId 
      : null;

    // 1. HIGH-PRECISION SLO MATCH (Regex)
    const sloRegex = /\b([A-Z]\d{1,2}[a-z]\d{1,2}|[A-Z]-\d{1,2}-\d{1,2}|\d\.\d\.\d)\b/gi;
    const foundCodes = query.match(sloRegex);
    
    let directResults: RetrievedChunk[] = [];
    if (foundCodes && foundCodes.length > 0) {
      const codeToSearch = foundCodes[0].toUpperCase();
      console.log(`🎯 [Retriever] Pattern Hit: ${codeToSearch}`);
      
      const { data: sloChunks } = await supabase
        .from('document_chunks')
        .select('id, chunk_text, slo_codes, page_number')
        .in('document_id', documentIds)
        .contains('slo_codes', [codeToSearch])
        .limit(4);

      if (sloChunks && sloChunks.length > 0) {
        directResults = sloChunks.map(c => ({
          id: c.id,
          text: c.chunk_text,
          sloCodes: c.slo_codes || [],
          similarity: 1.0, 
          pageNumber: c.page_number
        }));
      }
    }

    // 2. HYBRID SEMANTIC SEARCH (Vector Plane)
    const queryEmbedding = await generateEmbedding(query);

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

    const semanticResults = (data || []).map((d: any) => ({
      id: d.chunk_id,
      text: d.chunk_text,
      sloCodes: d.slo_codes || [],
      similarity: d.combined_score,
      pageNumber: d.page_number,
      sectionTitle: d.section_title
    }));

    // ADAPTIVE THRESHOLD: 0.10 ensures we find content even in dense pedagogical docs
    const filteredSemantic = semanticResults.filter((r: any) => r.similarity > 0.10);
    
    const allResults = [...directResults, ...filteredSemantic];
    
    // De-duplication + Priority Sorting
    const uniqueResults = Array.from(new Map(allResults.map(item => [item.id, item])).values())
      .sort((a, b) => b.similarity - a.similarity);
    
    console.log(`📡 [Retriever] Found ${uniqueResults.length} curriculum nodes.`);
    return uniqueResults.slice(0, maxChunks);

  } catch (err) {
    console.error('[Retriever Fatal]:', err);
    return [];
  }
}
