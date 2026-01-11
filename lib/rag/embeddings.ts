import { GoogleGenAI } from "@google/genai";

/**
 * GENERATE NEURAL EMBEDDING
 * Converts text into a 768-dimensional vector using Gemini.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // MUST use process.env.API_KEY exclusively
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('Embedding node requires API_KEY environment variable');

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    /**
     * Fix: The compiler reports that 'content' does not exist in 'EmbedContentParameters' 
     * and suggests 'contents'. We pass a Content array as expected by the plural 'contents' property.
     */
    const result = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text }] }]
    });

    if (!result.embeddings || result.embeddings.length === 0) {
      throw new Error("No embeddings returned from synthesis node.");
    }

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
  const batchSize = 10; // Conservative batching for rate limit stability
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    try {
      const batchEmbeddings = await Promise.all(
        batch.map(text => generateEmbedding(text))
      );
      embeddings.push(...batchEmbeddings);
      
      // Prevent burst throttling on large curriculum files
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error(`Batch processing failed at index ${i}`, err);
      throw err;
    }
  }
  
  return embeddings;
}
