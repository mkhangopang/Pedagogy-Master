
import { GoogleGenAI } from "@google/genai";

/**
 * GENERATE NEURAL EMBEDDING
 * Converts curriculum text into a 768-dimensional vector using Gemini.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Neural Node Failure: API_KEY environment variable is missing.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Using text-embedding-004 which produces 768-dim vectors
    const response: any = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: { parts: [{ text: text || " " }] }
    } as any);

    const result = response.embedding || (response.embeddings && response.embeddings[0]);

    if (!result || !result.values || !Array.isArray(result.values)) {
      throw new Error("Neural Node Error: Invalid vector format received.");
    }

    // Sanitize values for JSON safety (no NaN/Infinity) and ensure length
    const vector = result.values.map((v: any) => {
      const num = Number(v);
      return isFinite(num) ? num : 0;
    });

    // Ensure it matches pgvector(768) requirement
    if (vector.length < 768) {
      return [...vector, ...new Array(768 - vector.length).fill(0)];
    }
    return vector.slice(0, 768);
  } catch (error: any) {
    console.error('[Embedding Error]:', error);
    throw new Error(`Vector Synthesis Failed: ${error.message || 'Unknown provider error'}`);
  }
}

/**
 * BATCH EMBEDDING SYNTHESIS
 * Processes chunks in parallel batches to optimize performance for large documents.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  
  const CONCURRENCY_LIMIT = 5; // Process 5 embeddings at a time
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += CONCURRENCY_LIMIT) {
    const batch = texts.slice(i, i + CONCURRENCY_LIMIT);
    try {
      const batchEmbeddings = await Promise.all(batch.map(text => generateEmbedding(text)));
      results.push(...batchEmbeddings);
    } catch (err: any) {
      console.error(`[Embeddings Batch] Error at index ${i}:`, err);
      throw err;
    }
  }
  
  return results;
}
