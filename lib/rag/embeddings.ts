import { GoogleGenAI } from "@google/genai";

/**
 * GENERATE NEURAL EMBEDDING
 * Converts curriculum text into a 768-dimensional vector using Gemini.
 * This vector represents the semantic meaning of the text for RAG retrieval.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error('Neural Node Failure: API_KEY environment variable is missing.');
  }

  try {
    // Initialize AI client per guidelines
    const ai = new GoogleGenAI({ apiKey });
    
    // Using the state-of-the-art text-embedding-004 model
    const response = await ai.models.embedContent({
      model: "text-embedding-004",
      content: { parts: [{ text }] }
    });

    const result = response.embedding;

    if (!result || !result.values || !Array.isArray(result.values)) {
      throw new Error("Neural Node Error: Invalid response from embedding service.");
    }

    return result.values;
  } catch (error: any) {
    console.error('[Embedding Fatal Error]:', error);
    throw error;
  }
}

/**
 * BATCH EMBEDDING SYNTHESIS
 * Optimized for document indexing by processing multiple chunks.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  
  const embeddings: number[][] = [];
  // Batch size limited to ensure stability and avoid rate limits during one-time indexing
  const batchSize = 10; 
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    try {
      const batchResults = await Promise.all(
        batch.map(text => generateEmbedding(text))
      );
      embeddings.push(...batchResults);
    } catch (err) {
      console.error(`Batch node failure at index ${i}`, err);
      throw err;
    }
  }
  
  return embeddings;
}
