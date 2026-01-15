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
 * SEMANTIC RETRIEVER (v11.0 - BUILD FIX & ENHANCED MATCHING)
 * Resolves implicit 'any' build error and improves fuzzy SLO detection.
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  maxChunks: number = 10,
  priorityDocumentId?: string | null
): Promise<RetrievedChunk[]> {
  
  console.log(`🔍 [Retriever] High-Precision Scan: "${query.substring(0, 50)}..."`);
  
  try {
    const sanitizedPriorityId = (priorityDocumentId && /^[0-9a-fA-F-]{36}$/.test(priorityDocumentId)) 
      ? priorityDocumentId 
      : null;

    // 1. EXHAUSTIVE SLO TAG EXTRACTION
    // We generate as many variants as possible for the SQL overlap operator
    const boostTags: string[] = [];
    
    // Pattern: S8A5 or S-08-A-05
    const sloRegex = /([A-Z])[\s-]?(\d{1,2})[\s-]?([A-Z])[\s-]?(\d{1,2})/gi;
    const matches = Array.from(query.matchAll(sloRegex));
    
    matches.forEach(m => {
      const letter1 = m[1].toUpperCase();
      const num1 = parseInt(m[2], 10);
      const letter2 = m[3].toUpperCase();
      const num2 = parseInt(m[4], 10);

      // Generate variants: 
      // S8A5, S08A05, S-8-A-5, S-08-A-05, S 8 A 5
      const variants = [
        `${letter1}${num1}${letter2}${num2}`,
        `${letter1}${num1.toString().padStart(2, '0')}${letter2}${num2.toString().padStart(2, '0')}`,
        `${letter1}-${num1}-${letter2}-${num2}`,
        `${letter1}-${num1.toString().padStart(2, '0')}-${letter2}-${num2.toString().padStart(2, '0')}`,
        `${letter1} ${num1} ${letter2} ${num2}`,
        m[0].toUpperCase()
      ];
      boostTags.push(...variants);
    });

    // Handle hierarchical codes (e.g., 8.1.2)
    const hierMatches = query.match(/\b\d+\.\d+(?:\.\d+)?(?:\.\d+)?\b/g) || [];
    boostTags.push(...hierMatches);

    // Filter boostTags for unique values and reasonable length
    const finalBoostTags = Array.from(new Set(boostTags.map(t => t.trim()).filter(t => t.length >= 2)));
    console.log(`🎯 [Retriever] Boosting Tags:`, finalBoostTags);

    // 2. HYBRID SEMANTIC SEARCH
    const queryEmbedding = await generateEmbedding(query);

    const { data, error } = await supabase.rpc('hybrid_search_chunks_v2', {
      query_embedding: queryEmbedding, 
      match_count: maxChunks,
      filter_document_ids: documentIds,
      priority_document_id: sanitizedPriorityId,
      boost_tags: finalBoostTags
    });

    if (error) {
      console.error('❌ [Retriever RPC Error]:', error);
      return [];
    }

    // Explicitly typing the array to resolve TypeScript build error
    const uniqueResults: RetrievedChunk[] = (data || []).map((d: any) => ({
      id: d.chunk_id,
      text: d.chunk_text,
      sloCodes: d.slo_codes || [],
      similarity: d.combined_score,
      pageNumber: d.page_number,
      sectionTitle: d.section_title
    }));
    
    console.log(`📡 [Retriever] Syncing ${uniqueResults.length} nodes for synthesis.`);
    
    // Sort by combined score (similarity + boost)
    return uniqueResults.sort((a: RetrievedChunk, b: RetrievedChunk) => b.similarity - a.similarity);

  } catch (err) {
    console.error('[Retriever Fatal]:', err);
    return [];
  }
}