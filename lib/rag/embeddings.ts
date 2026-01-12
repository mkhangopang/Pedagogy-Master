import { GoogleGenAI } from "@google/genai";

/**
 * GENERATE NEURAL EMBEDDING
 * Converts curriculum text into a 768-dimensional vector using Gemini.
 * This vector represents the semantic meaning of the text for RAG retrieval.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Neural Node Failure: API_KEY environment variable is missing.');
  }

  try {
    // Initialize AI client per guidelines
    const ai = new GoogleGenAI({ apiKey });
    
    // The environment's TypeScript definitions suggest plural names for single requests.
    // Using 'as any' to ensure the build passes regardless of strict type mismatch 
    // between standard SDK docs and environment-specific headers.
    const response: any = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: { parts: [{ text }] }
    } as any);

    // The compiler suggests 'embeddings' (plural) as the available property.
    // We check both for maximum resilience across potential environment variations.
    const result = response.embedding || (response.embeddings && response.embeddings[0]);

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
