import { GoogleGenAI } from "@google/genai";

/**
 * GENERATE NEURAL EMBEDDING
 * Converts text into a 768-dimensional vector using Gemini.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // MUST use process.env.API_KEY exclusively
  if (!process.env.API_KEY) throw new Error('Embedding node requires API_KEY environment variable');

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    /**
     * Use the text-embedding-004 model for pedagogical vector synthesis.
     */
    const result = await ai.models.embedContent({
      model: "text-embedding-004",
      content: { parts: [{ text }] }
    });

    const embedding = result.embedding;

    if (!embedding || !embedding.values) {
      throw new Error("No valid embedding values returned from synthesis node.");
    }

    return embedding.values;
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
  if (!texts.length) return [];
  
  const embeddings: number[][] = [];
  const batchSize = 10;
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    try {
      const batchEmbeddings = await Promise.all(
        batch.map(text => generateEmbedding(text))
      );
      embeddings.push(...batchEmbeddings);
      
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (err) {
      console.error(`Batch processing failed at chunk index ${i}`, err);
      throw err;
    }
  }
  
  return embeddings;
}
