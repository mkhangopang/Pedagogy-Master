
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
 * SEMANTIC RETRIEVER (v9.0 - SMART SLO EXTRACTION)
 * Fixes: Now extracts tags from query to boost specific curriculum nodes.
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

    // 1. NEURAL SLO TAG EXTRACTION
    // We extract likely SLO tags to pass to the SQL keyword booster
    const sloRegex = /([A-Z])[\s-]?(\d{1,2})[\s-]?([A-Z])[\s-]?(\d{1,2})/gi;
    const matches = Array.from(query.matchAll(sloRegex));
    const boostTags: string[] = [];
    
    matches.forEach(m => {
      // Add multiple variants for maximum recall
      const normalized = `${m[1]}${m[2]}${m[3]}${m[4]}`.toUpperCase();
      const spaced = `${m[1]} ${m[2]} ${m[3]} ${m[4]}`.toUpperCase();
      const hyphenated = `${m[1]}-${m[2]}-${m[3]}-${m[4]}`.toUpperCase();
      boostTags.push(normalized, spaced, hyphenated, m[0].toUpperCase());
    });

    // Handle hierarchical codes (e.g., 8.1.2)
    const hierMatches = query.match(/\b\d+\.\d+(?:\.\d+)?(?:\.\d+)?\b/g) || [];
    boostTags.push(...hierMatches);

    // 2. HYBRID SEMANTIC SEARCH WITH TAG BOOSTING
    const queryEmbedding = await generateEmbedding(query);

    // Filter boostTags for unique values and reasonable length
    const finalBoostTags = Array.from(new Set(boostTags.filter(t => t.length >= 2)));

    const { data, error } = await supabase.rpc('hybrid_search_chunks_v2', {
      query_embedding: queryEmbedding, 
      match_count: maxChunks,
      filter_document_ids: documentIds,
      priority_document_id: sanitizedPriorityId,
      boost_tags: finalBoostTags
    });

    if (error) {
      console.error('❌ [Retriever RPC Error]:', error);
      // Fallback: If RPC fails, try a simple vector-only search if boost_tags or signature mismatch
      return [];
    }

    const uniqueResults = (data || []).map((d: any) => ({
      id: d.chunk_id,
      text: d.chunk_text,
      sloCodes: d.slo_codes || [],
      similarity: d.combined_score,
      pageNumber: d.page_number,
      sectionTitle: d.section_title
    }));
    
    console.log(`📡 [Retriever] Syncing ${uniqueResults.length} curriculum nodes for synthesis.`);
    return uniqueResults.sort((a, b) => b.similarity - a.similarity);

  } catch (err) {
    console.error('[Retriever Fatal]:', err);
    return [];
  }
}
