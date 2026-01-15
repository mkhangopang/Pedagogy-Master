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
 * SEMANTIC RETRIEVER (v12.0 - PRODUCTION STABLE)
 * Resolves build errors and implements high-fidelity curriculum matching.
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

    // 1. ROBUST SLO TAG EXTRACTION
    const boostTags: string[] = [];
    
    // Pattern: S8A5, S-08-A-05, s8 a5
    const sloRegex = /([A-Z])[\s-]?(\d{1,2})[\s-]?([A-Z])[\s-]?(\d{1,2})/gi;
    const matches = Array.from(query.matchAll(sloRegex));
    
    matches.forEach(m => {
      const letter1 = m[1].toUpperCase();
      const num1 = parseInt(m[2], 10);
      const letter2 = m[3].toUpperCase();
      const num2 = parseInt(m[4], 10);

      // Generate variants for database overlap check
      boostTags.push(
        `${letter1}${num1}${letter2}${num2}`, // S8A5
        `${letter1}${num1.toString().padStart(2, '0')}${letter2}${num2.toString().padStart(2, '0')}`, // S08A05
        `${letter1}-${num1}-${letter2}-${num2}`, // S-8-A-5
        `${letter1} ${num1} ${letter2} ${num2}`, // S 8 A 5
        m[0].toUpperCase().replace(/\s+/g, '') // Cleaned raw match
      );
    });

    // Support hierarchical numeric codes (e.g., 8.1.2)
    const hierMatches = query.match(/\b\d+\.\d+(?:\.\d+)?(?:\.\d+)?\b/g) || [];
    boostTags.push(...hierMatches);

    const finalBoostTags = Array.from(new Set(boostTags.map(t => t.trim()).filter(t => t.length >= 2)));
    console.log(`🎯 [Retriever] Active Boost Tags:`, finalBoostTags);

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

    // Explicit typing for 'uniqueResults' to prevent "implicitly has any" build errors
    const uniqueResults: RetrievedChunk[] = (data || []).map((d: any) => ({
      id: d.chunk_id,
      text: d.chunk_text,
      sloCodes: d.slo_codes || [],
      similarity: d.combined_score,
      pageNumber: d.page_number,
      sectionTitle: d.section_title
    }));
    
    console.log(`📡 [Retriever] Synced ${uniqueResults.length} curriculum nodes for reasoning.`);
    
    // Explicitly typed sort parameters to satisfy TypeScript production build
    return uniqueResults.sort((a: RetrievedChunk, b: RetrievedChunk) => b.similarity - a.similarity);

  } catch (err) {
    console.error('[Retriever Fatal]:', err);
    return [];
  }
}