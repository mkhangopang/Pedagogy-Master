import { GoogleGenAI } from "@google/genai";

/**
 * GENERATE NEURAL EMBEDDING
 * Converts text into a 768-dimensional vector using Gemini.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Embedding node requires API_KEY');

  try {
    const ai = new GoogleGenAI({ apiKey });
    // Use text-embedding-004 for state-of-the-art semantic representation
    const result = await ai.models.embedContent({
      model: "text-embedding-004",
      content: { parts: [{ text }] }
    });

    return result.embeddings[0].values;
  } catch (error) {
    console.error('[Embedding Error]:', error);
    throw error;
  }
}

/**
 * BATCH EMBEDDING ENGINE
 * Optimized for high-throughput document indexing.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  const batchSize = 20; // Gemini limit for single call
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchEmbeddings = await Promise.all(
      batch.map(text => generateEmbedding(text))
    );
    embeddings.push(...batchEmbeddings);
    
    // Prevent rate limiting on large curriculum files
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  return embeddings;
}
