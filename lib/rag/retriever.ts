import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { parseUserQuery } from './query-parser';

export interface RetrievedChunk {
  chunk_id: string;
  chunk_text: string;
  slo_codes: string[];
  page_number: number | null;
  section_title: string | null;
  combined_score: number | null;
  grade_levels?: string[];
  topics?: string[];
  bloom_levels?: string[];
}

/**
 * HIGH-PRECISION RAG RETRIEVER (v30.0 - METADATA AWARE)
 * Uses parsed metadata to filter and boost relevant curriculum context.
 */
export async function retrieveRelevantChunks({
  query,
  documentIds,
  supabase,
  matchCount = 25 
}: {
  query: string;
  documentIds: string[];
  supabase: SupabaseClient;
  matchCount?: number;
}): Promise<RetrievedChunk[]> {
  try {
    if (!documentIds || documentIds.length === 0) return [];

    // Step 1: Intelligent Query Parsing
    const parsed = parseUserQuery(query);
    console.log(`🎯 [Retriever] Metadata Signals Identified:`, {
      sloCodes: parsed.sloCodes,
      grades: parsed.grades,
      topics: parsed.topics,
      bloom: parsed.bloomLevel
    });
    
    // Step 2: Vector Synthesis
    const queryEmbedding = await generateEmbedding(query);
    
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      console.error('❌ [Retriever] Vector synthesis failed.');
      return [];
    }

    // Step 3: Hybrid Search v3 (Metadata Augmented)
    const { data: chunks, error } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_document_ids: documentIds,
      priority_document_id: documentIds[0], 
      boost_slo_codes: parsed.sloCodes,
      filter_grades: parsed.grades.length > 0 ? parsed.grades : null,
      filter_topics: parsed.topics.length > 0 ? parsed.topics : null,
      filter_bloom: parsed.bloomLevel ? [parsed.bloomLevel] : null
    });
    
    if (error) {
      console.error('❌ [Retriever] RPC v3 Search Failure:', error.message);
      // Failsafe to v2 search if v3 is missing or fails
      const { data: v2Chunks } = await supabase.rpc('hybrid_search_chunks_v2', {
        query_embedding: queryEmbedding,
        match_count: matchCount,
        filter_document_ids: documentIds,
        priority_document_id: documentIds[0],
        boost_tags: parsed.sloCodes
      });
      return (v2Chunks || []).map(processResult);
    }
    
    console.log(`✅ [Retriever] Synced ${chunks?.length || 0} precision nodes across ${documentIds.length} assets.`);
    return (chunks || []).map(processResult);
    
    function processResult(d: any): RetrievedChunk {
      return {
        chunk_id: d.chunk_id,
        chunk_text: d.chunk_text,
        slo_codes: d.slo_codes || [],
        page_number: d.page_number,
        section_title: d.section_title,
        combined_score: d.combined_score,
        grade_levels: d.grade_levels,
        topics: d.topics,
        bloom_levels: d.bloom_levels
      };
    }
    
  } catch (err) {
    console.error('❌ [Retriever] Critical Fault:', err);
    return [];
  }
}
