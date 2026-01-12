import { GoogleGenAI } from "@google/genai";

/**
 * GENERATE NEURAL EMBEDDING
 * Converts text into a 768-dimensional vector using Gemini.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Support both standard and Vercel-specific API key names
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Embedding node requires API_KEY or GEMINI_API_KEY environment variable');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    /**
     * Use the text-embedding-004 model for pedagogical vector synthesis.
     * Per user instruction, we use 'contents' instead of 'content' to pass the text.
     */
    const response = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: text
    });

    /**
     * The response for a single embedContent call contains an 'embedding' property.
     * We extract the numerical vector from embedding.values.
     */
    const result = response.embedding;

    if (!result || !result.values || !Array.isArray(result.values)) {
      throw new Error("No valid embedding values returned from synthesis node. Check API configuration.");
    }

    return result.values;
  } catch (error: any) {
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
      
      // Stagger batches to prevent rate limiting on the free tier
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