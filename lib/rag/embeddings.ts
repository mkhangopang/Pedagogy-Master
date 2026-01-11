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
     * The @google/genai SDK version 1.34.0 uses plural 'contents' for the input payload
     * and returns an array of 'embeddings' in the response.
     */
    const response = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: { parts: [{ text }] }
    });

    // The response for @google/genai's embedContent provides an 'embeddings' array.
    // We access the first result for single-content requests.
    const result = response.embeddings;

    if (!result || !Array.isArray(result) || result.length === 0) {
      throw new Error("No valid embedding values returned from synthesis node.");
    }

    const values = result[0].values;

    if (!values || !Array.isArray(values)) {
      throw new Error("Malformed embedding vector returned from synthesis node.");
    }

    return values;
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
