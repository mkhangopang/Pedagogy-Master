import { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";
import { generateEmbedding } from './embeddings';
import { extractSLOCodes } from './slo-extractor';

export interface RetrievalFilters {
  userId?: string;
  documentIds?: string[];
  subject?: string;
  gradeLevel?: string;
}

export interface RetrievedChunk {
  id: string;
  content: string;
  metadata: any;
  similarity: number;
}

/**
 * HYBRID RETRIEVAL ENGINE (v1.0)
 * Combines exact SLO matching with semantic vector search.
 */
export async function smartRetrieve(
  query: string,
  supabase: SupabaseClient,
  filters: RetrievalFilters = {},
  topK: number = 5
): Promise<RetrievedChunk[]> {
  
  const targetSLOs = extractSLOCodes(query);
  const queryEmbedding = await generateEmbedding(query);

  // Call hybrid search function defined in the DB
  const { data, error } = await supabase.rpc('hybrid_search_chunks_v3', {
    query_text: query,
    query_embedding: queryEmbedding,
    match_count: topK * 2,
    filter_document_ids: filters.documentIds || null
  });

  if (error) {
    console.error('Retrieval error:', error);
    return [];
  }

  const rawResults = (data || []).map((item: any) => ({
    id: item.id,
    content: item.chunk_text,
    metadata: item.metadata,
    similarity: item.combined_score || 0
  }));

  // AI-Powered Reranking for high-stakes queries
  if (rawResults.length > 0 && (query.includes('LESSON PLAN') || query.includes('QUIZ'))) {
    return await rerankResults(query, rawResults, topK);
  }

  return rawResults.slice(0, topK);
}

/**
 * NEURAL RERANKER
 * Uses Gemini to evaluate the relevance of top candidates.
 */
async function rerankResults(query: string, chunks: RetrievedChunk[], topK: number): Promise<RetrievedChunk[]> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Rate the pedagogical relevance of these curriculum chunks to the query: "${query}"
      
      CHUNKS:
      ${chunks.map((c, i) => `[${i}] ${c.content.substring(0, 300)}`).join('\n---\n')}
      
      Return ONLY a comma-separated list of indices in order of relevance. Example: 2, 0, 1`
    });

    const response = await model;
    const order = response.text.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    
    const sorted = order.map(idx => chunks[idx]).filter(Boolean);
    return sorted.slice(0, topK);
  } catch (e) {
    return chunks.slice(0, topK);
  }
}

/**
 * CONTEXT CONSTRUCTOR
 * Prepares the grounded prompt for the generation agents.
 */
export function buildContextString(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "[NO_AUTHORITATIVE_CONTEXT_FOUND]";
  
  return chunks.map((c, i) => `
### VAULT_NODE_${i+1}
SOURCE: ${c.metadata.title || 'Curriculum'}
CONTENT:
${c.content}
`).join('\n\n');
}