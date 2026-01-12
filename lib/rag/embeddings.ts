
import { GoogleGenAI } from "@google/genai";

/**
 * GENERATE NEURAL EMBEDDING (Single)
 * Used for individual queries or small text blocks.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  if (!apiKey) throw new Error('API_KEY missing');

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response: any = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: { parts: [{ text: text || " " }] }
    } as any);

    const result = response.embedding || (response.embeddings && response.embeddings[0]);
    if (!result?.values) throw new Error("Invalid embedding response");

    // Standardize to 768 dimensions for pgvector compatibility
    const vector = result.values.map((v: any) => isFinite(Number(v)) ? Number(v) : 0);
    if (vector.length < 768) {
      return [...vector, ...new Array(768 - vector.length).fill(0)];
    }
    return vector.slice(0, 768);
  } catch (error: any) {
    console.error('[Single Embedding Error]:', error);
    throw error;
  }
}

/**
 * BATCH EMBEDDING SYNTHESIS (High Performance)
 * Optimized for document indexing. Processes chunks in large native batches
 * to minimize network overhead and prevent serverless timeouts.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  
  const NATIVE_BATCH_SIZE = 100; // Gemini supports batching multiple requests
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += NATIVE_BATCH_SIZE) {
    const batchTexts = texts.slice(i, i + NATIVE_BATCH_SIZE);
    
    try {
      // Use the native batch API for massive performance gain
      const batchResponse: any = await (ai as any).models.batchEmbedContents({
        model: "text-embedding-004",
        requests: batchTexts.map(text => ({
          content: { parts: [{ text: text || " " }] }
        }))
      });

      if (!batchResponse.embeddings) {
        throw new Error("Batch synthesis failed: No embeddings returned.");
      }

      const vectors = batchResponse.embeddings.map((emb: any) => {
        const v = emb.values.map((val: any) => isFinite(Number(val)) ? Number(val) : 0);
        // Pad or slice to exactly 768 dims
        if (v.length < 768) return [...v, ...new Array(768 - v.length).fill(0)];
        return v.slice(0, 768);
      });

      results.push(...vectors);
    } catch (err: any) {
      console.error(`[Batch Embedding Error] at offset ${i}:`, err);
      // Fallback to sequential if batch fails for some reason
      for (const text of batchTexts) {
        results.push(await generateEmbedding(text));
      }
    }
  }
  
  return results;
}
