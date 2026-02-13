
import { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from "@google/genai";
import { generateEmbedding } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

export interface RetrievalFilters {
  userId?: string;
  documentIds?: string[];
  subject?: string;
  gradeLevel?: string;
  sloCode?: string;
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  content: string;
  metadata: any;
  similarity?: number;
  rank?: number;
}

/**
 * HYBRID SEARCH: Combines keyword + semantic search using the DB's native capabilities.
 */
export async function hybridSearch(
  query: string,
  supabase: SupabaseClient,
  filters: RetrievalFilters = {},
  topK: number = 5
): Promise<RetrievedChunk[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);

    const { data, error } = await supabase.rpc('hybrid_search_chunks_v3', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: topK,
      filter_document_ids: filters.documentIds || null
    });

    if (error) {
      console.error('Hybrid search error:', error);
      return [];
    }

    return (data || []).map((item: any) => ({
      id: item.id,
      documentId: item.document_id,
      content: item.chunk_text,
      metadata: item.metadata,
      rank: item.combined_score
    }));
  } catch (error) {
    console.error('Hybrid search failed:', error);
    return [];
  }
}

/**
 * SLO LOOKUP: Specialized retrieval for specific Student Learning Outcomes.
 */
export async function sloLookup(
  sloCode: string,
  supabase: SupabaseClient,
  documentIds?: string[]
): Promise<RetrievedChunk[]> {
  try {
    const { data, error } = await supabase
      .from('document_chunks')
      .select('id, document_id, chunk_text, metadata')
      .contains('slo_codes', [sloCode])
      .in('document_id', documentIds || [])
      .limit(5);

    if (error) throw error;

    if (data && data.length > 0) {
      return data.map((item: any) => ({
        id: item.id,
        documentId: item.document_id,
        content: item.chunk_text,
        metadata: item.metadata
      }));
    }

    // Fallback to hybrid search if no exact code match found
    return hybridSearch(`SLO ${sloCode}`, supabase, { documentIds }, 3);
  } catch (error) {
    console.error('SLO lookup failed:', error);
    return [];
  }
}

/**
 * SMART RETRIEVAL: Automatically chooses the best search strategy based on query intent.
 */
export async function smartRetrieval(
  query: string,
  supabase: SupabaseClient,
  filters: RetrievalFilters = {},
  topK: number = 5
): Promise<RetrievedChunk[]> {
  const targetSLOs = extractSLOCodes(query);
  
  if (targetSLOs.length > 0) {
    return sloLookup(targetSLOs[0].code, supabase, filters.documentIds);
  }

  return hybridSearch(query, supabase, filters, topK);
}

/**
 * RERANK: Improve retrieval quality by reranking results
 * FIXED: Uses @google/genai and property access for .text
 */
export async function rerankResults(
  query: string,
  chunks: RetrievedChunk[],
  topK: number = 5
): Promise<RetrievedChunk[]> {
  if (chunks.length === 0) return [];

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a relevance scorer for curriculum documents.
      
      QUERY: "${query}"
      
      Rate each chunk's relevance to the query on a scale of 0-100.
      
      CHUNKS:
      ${chunks.map((chunk, i) => `[${i}] ${chunk.content.substring(0, 500)}...`).join('\n---\n')}
      
      Return ONLY a JSON array of numbers (scores) representing the relevance of each index.
      Example: [85, 72, 91, 45, 68]`,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text;
    
    if (!responseText) {
      console.warn('No response text from reranking, using original order');
      return chunks.slice(0, topK);
    }

    const scores = JSON.parse(responseText);

    if (!Array.isArray(scores) || scores.length !== chunks.length) {
      console.warn('Invalid scores format, using original order');
      return chunks.slice(0, topK);
    }

    const rankedChunks = chunks.map((chunk, i) => ({
      ...chunk,
      rank: typeof scores[i] === 'number' ? scores[i] : 0
    }));

    return rankedChunks
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))
      .slice(0, topK);
      
  } catch (error) {
    console.error('Reranking error:', error);
    return chunks.slice(0, topK);
  }
}

/**
 * CONTEXT BUILDER: Constructs a grounded context string for the LLM.
 */
export async function buildContext(
  query: string,
  supabase: SupabaseClient,
  filters: RetrievalFilters = {},
  maxTokens: number = 20000
): Promise<string> {
  try {
    const chunks = await smartRetrieval(query, supabase, filters, 15);

    if (chunks.length === 0) {
      return 'No relevant curriculum context found in the vault for this query.';
    }

    const rankedChunks = await rerankResults(query, chunks, 8);

    let context = '';
    for (const chunk of rankedChunks) {
      const chunkText = `
### ASSET_NODE: ${chunk.metadata?.title || 'Curriculum Reference'}
[ID: ${chunk.id}] [Subject: ${chunk.metadata?.subject || 'N/A'}]
[SLOs: ${chunk.metadata?.slo_codes?.join(', ') || 'General'}]

CONTENT:
${chunk.content}
---
`;
      if ((context.length + chunkText.length) > maxTokens) break;
      context += chunkText;
    }

    return context || 'Neural vault search returned insufficient results.';
  } catch (error) {
    console.error('Context building error:', error);
    return 'Grid Error: Unable to retrieve grounded curriculum context.';
  }
}
