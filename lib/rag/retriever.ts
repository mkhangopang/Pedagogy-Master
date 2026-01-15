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
 * SEMANTIC RETRIEVER (v8.0 - ULTRA-HIGH RECALL)
 * Aggressively matches curriculum codes even with non-standard user formatting.
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  maxChunks: number = 10,
  priorityDocumentId?: string | null
): Promise<RetrievedChunk[]> {
  
  // Normalize Query: "slo s8 a5" -> "S8A5" for internal pattern matching
  const normalizedQuery = query.toUpperCase().replace(/\s+/g, '');
  console.log(`🔍 [Retriever] High-Precision Scan: "${normalizedQuery}"`);
  
  try {
    const sanitizedPriorityId = (priorityDocumentId && /^[0-9a-fA-F-]{36}$/.test(priorityDocumentId)) 
      ? priorityDocumentId 
      : null;

    // 1. NEURAL SLO PATTERN MATCHING
    // Pattern 1: Alphanumeric clusters (S8A5, S-08-A-05, etc.)
    const sloRegex = /([A-Z])[\s-]?(\d{1,2})[\s-]?([A-Z])[\s-]?(\d{1,2})/gi;
    const matches = Array.from(query.matchAll(sloRegex));
    
    // Pattern 2: Simple Hierarchical (8.1.2)
    const hierRegex = /\b\d+\.\d+(?:\.\d+)?(?:\.\d+)?\b/g;
    const hierMatches = query.match(hierRegex) || [];

    let directResults: RetrievedChunk[] = [];
    
    // Process complex SLO codes
    if (matches.length > 0) {
      const codeToSearch = `${matches[0][1]}${matches[0][2]}${matches[0][3]}${matches[0][4]}`.toUpperCase();
      console.log(`🎯 [Retriever] Target SLO Identified: ${codeToSearch}`);
      
      const { data: sloChunks } = await supabase
        .from('document_chunks')
        .select('id, chunk_text, slo_codes, page_number')
        .in('document_id', documentIds)
        .or(`slo_codes.cs.{${codeToSearch}},slo_codes.cs.{${matches[0][0].toUpperCase().replace(/\s/g,'')}}`)
        .limit(8);

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

    // 2. HYBRID SEMANTIC SEARCH
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

    // ADAPTIVE THRESHOLD: 0.05 to ensure recall in complex instructional context
    const filteredSemantic = semanticResults.filter((r: any) => r.similarity > 0.05);
    
    const allResults = [...directResults, ...filteredSemantic];
    
    // De-duplication and Priority Sorting
    const uniqueResults = Array.from(new Map(allResults.map(item => [item.id, item])).values())
      .sort((a, b) => b.similarity - a.similarity);
    
    console.log(`📡 [Retriever] Grounding synced. Context nodes active: ${uniqueResults.length}`);
    return uniqueResults.slice(0, maxChunks);

  } catch (err) {
    console.error('[Retriever Fatal]:', err);
    return [];
  }
}