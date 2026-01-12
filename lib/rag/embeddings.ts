import { GoogleGenAI } from "@google/genai";

/**
 * GENERATE NEURAL EMBEDDING
 * Converts curriculum text into a 768-dimensional vector using Gemini.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Embedding node requires API_KEY or GEMINI_API_KEY environment variable');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Using the state-of-the-art text-embedding-004 model
    const response = await ai.models.embedContent({
      model: "text-embedding-004",
      content: { parts: [{ text }] }
    });

    const result = response.embedding;

    if (!result || !result.values || !Array.isArray(result.values)) {
      throw new Error("Invalid response from embedding node.");
    }

    return result.values;
  } catch (error: any) {
    console.error('[Embedding Error]:', error);
    throw error;
  }
}

/**
 * BATCH EMBEDDING ENGINE
 * Optimized for document indexing by processing multiple chunks in parallel.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  
  // Processing in smaller batches to respect API limits
  const embeddings: number[][] = [];
  const batchSize = 16; 
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    try {
      const batchEmbeddings = await Promise.all(
        batch.map(text => generateEmbedding(text))
      );
      embeddings.push(...batchEmbeddings);
    } catch (err) {
      console.error(`Batch processing failed at index ${i}`, err);
      throw err;
    }
  }
  
  return embeddings;
}
