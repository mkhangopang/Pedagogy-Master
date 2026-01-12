
import { GoogleGenAI } from "@google/genai";

/**
 * GENERATE NEURAL EMBEDDING
 * Converts curriculum text into a 768-dimensional vector using Gemini.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Resilient API Key lookup
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Neural Node Failure: API_KEY environment variable is missing.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const response: any = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: { parts: [{ text }] }
    } as any);

    // Some versions of the response return 'embedding', others 'embeddings' as an array
    const result = response.embedding || (response.embeddings && response.embeddings[0]);

    if (!result || !result.values || !Array.isArray(result.values)) {
      console.error('[Embedding Error] Full response:', JSON.stringify(response));
      throw new Error("Neural Node Error: The embedding service returned an invalid vector format.");
    }

    // Ensure all values are valid numbers (no NaN/Infinity which break JSON)
    return result.values.map((v: any) => {
      const num = Number(v);
      return isFinite(num) ? num : 0;
    });
  } catch (error: any) {
    console.error('[Embedding Fatal Error]:', error);
    throw new Error(`Vector Synthesis Failed: ${error.message || 'Unknown provider error'}`);
  }
}

/**
 * BATCH EMBEDDING SYNTHESIS
 * Optimized for document indexing by processing multiple chunks.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  
  const embeddings: number[][] = [];
  const batchSize = 10; 
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    try {
      const batchResults = await Promise.all(
        batch.map(text => generateEmbedding(text))
      );
      embeddings.push(...batchResults);
    } catch (err: any) {
      console.error(`Batch node failure at index ${i}`, err);
      throw err;
    }
  }
  
  return embeddings;
}
