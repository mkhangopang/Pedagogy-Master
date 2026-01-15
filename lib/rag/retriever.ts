
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
 * SEMANTIC RETRIEVER (v7.0 - FUZZY SLO MATCH)
 * Handles spaces and case differences in curriculum codes (e.g., "s8 a5" -> "S8A5").
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  maxChunks: number = 10,
  priorityDocumentId?: string | null
): Promise<RetrievedChunk[]> {
  
  // Normalize Query: "slo s8 a5" -> "SLOS8A5" for internal pattern matching
  const normalizedQuery = query.toUpperCase().replace(/\s+/g, '');
  console.log(`🔍 [Retriever] Normalized Search: "${normalizedQuery}"`);
  
  try {
    const sanitizedPriorityId = (priorityDocumentId && /^[0-9a-fA-F-]{36}$/.test(priorityDocumentId)) 
      ? priorityDocumentId 
      : null;

    // 1. FUZZY SLO MATCHING (Regex with optional separators)
    // Supports: S-08-A-03, S8a5, 8.1.2, S 8 A 5
    const sloRegex = /([A-Z])[\s-]?(\d{1,2})[\s-]?([A-Z]|[a-z])[\s-]?(\d{1,2})/gi;
    const matches = Array.from(query.matchAll(sloRegex));
    
    let directResults: RetrievedChunk[] = [];
    if (matches.length > 0) {
      // Reconstruct standard format: S8A5
      const codeToSearch = `${matches[0][1]}${matches[0][2]}${matches[0][3]}${matches[0][4]}`.toUpperCase();
      console.log(`🎯 [Retriever] SLO Detected: ${codeToSearch}`);
      
      const { data: sloChunks } = await supabase
        .from('document_chunks')
        .select('id, chunk_text, slo_codes, page_number')
        .in('document_id', documentIds)
        .or(`slo_codes.cs.{${codeToSearch}},slo_codes.cs.{${matches[0][0].toUpperCase()}}`)
        .limit(6);

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

    // 2. HYBRID SEMANTIC VECTOR SEARCH
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

    // ADAPTIVE THRESHOLD: 0.05 - extremely high recall for pedagogical text
    const filteredSemantic = semanticResults.filter((r: any) => r.similarity > 0.05);
    
    const allResults = [...directResults, ...filteredSemantic];
    
    // De-duplication + Weighting
    const uniqueResults = Array.from(new Map(allResults.map(item => [item.id, item])).values())
      .sort((a, b) => b.similarity - a.similarity);
    
    console.log(`📡 [Retriever] Syncing ${uniqueResults.length} curriculum nodes for synthesis.`);
    return uniqueResults.slice(0, maxChunks);

  } catch (err) {
    console.error('[Retriever Fatal]:', err);
    return [];
  }
}
