import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

// Exporting to allow other modules to import it from this entry point
export { extractSLOCodes };

export interface RetrievedChunk {
  chunk_id: string;
  chunk_text: string;
  slo_codes: string[];
  combined_score: number;
  section_title?: string;
  page_number?: number;
}

/**
 * HIGH-PRECISION TOOL-FACTORY RETRIEVER (v19.0)
 * Optimized to find the specific SLO "seed" needed for pedagogical synthesis.
 * FIX: Reverted to positional parameters to resolve signature mismatches in callers.
 */
export async function retrieveRelevantChunks(
  query: string,
  documentIds: string[],
  supabase: SupabaseClient,
  matchCount: number = 5,
  priorityDocumentId?: string
): Promise<RetrievedChunk[]> {
  try {
    // Step 1: Extract SLO codes from user query
    const extractedSLOs = extractSLOCodes(query);
    console.log('🎯 User query:', query);
    console.log('📝 Extracted SLO codes:', extractedSLOs);
    
    // Step 2: Generate query embedding (768 dimensions)
    const queryEmbedding = await generateEmbedding(query);
    
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      console.error('❌ Invalid embedding generated:', queryEmbedding?.length);
      return [];
    }
    
    console.log('✅ Query embedding generated (768 dimensions)');
    
    // Step 3: Call Supabase RPC with CORRECT parameters
    // filter_document_ids expects an array of UUIDs.
    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v2', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: documentIds,
      priority_document_id: priorityDocumentId || null,
      boost_tags: extractedSLOs.length > 0 ? extractedSLOs : []
    });
    
    if (error) {
      console.error('❌ Supabase RPC error:', error);
      return [];
    }
    
    console.log('✅ Retrieved chunks:', chunks?.length || 0);
    
    if (chunks && chunks.length > 0) {
      console.log('📚 Sample chunk SLOs:', chunks[0].slo_codes);
      const matched = chunks.filter((c: any) => 
        c.slo_codes?.some((code: string) => extractedSLOs.includes(code))
      ).length;
      console.log('🎯 Chunks matching query SLOs:', matched);
    } else {
      console.warn('⚠️ No chunks retrieved for query:', query);
    }
    
    return (chunks || []).map((d: any) => ({
      chunk_id: d.chunk_id,
      chunk_text: d.chunk_text,
      slo_codes: d.slo_codes || [],
      combined_score: d.combined_score,
      page_number: d.page_number,
      section_title: d.section_title
    }));
    
  } catch (err) {
    console.error('❌ Retrieval error:', err);
    return [];
  }
}
