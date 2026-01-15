import { GoogleGenAI } from "@google/genai";

/**
 * VECTOR SYNTHESIS ENGINE (v17.5)
 * Corrected: Changed 'content' to 'contents' to match SDK spec.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('Neural Node Error: API_KEY missing for embeddings.');

  try {
    const ai = new GoogleGenAI({ apiKey });
    // The SDK requires 'contents' for the parameter name
    const response: any = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: { parts: [{ text: text || " " }] } 
    });

    const result = response.embedding;
    if (!result?.values) throw new Error("Neural Node Error: Invalid vector response.");

    const vector = result.values.map((v: any) => {
      const n = Number(v);
      return isFinite(n) ? n : 0;
    });

    // Ensure 768-dimension alignment for pgvector compatibility
    if (vector.length < 768) {
      return [...vector, ...new Array(768 - vector.length).fill(0)];
    }
    return vector.slice(0, 768);
  } catch (error: any) {
    console.error('[Embedding Error]:', error);
    throw new Error(`Vector Synthesis Failed: ${error.message}`);
  }
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('Neural Node Error: API_KEY missing for batch embeddings.');
  
  const ai = new GoogleGenAI({ apiKey });
  const CONCURRENCY_LIMIT = 5; 
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += CONCURRENCY_LIMIT) {
    const batchSlice = texts.slice(i, i + CONCURRENCY_LIMIT);
    try {
      const promises = batchSlice.map(text => 
        ai.models.embedContent({
          model: "text-embedding-004",
          contents: { parts: [{ text: text || " " }] }
        })
      );

      const batchResponses = await Promise.all(promises);
      const vectors = batchResponses.map((response: any) => {
        const values = response.embedding?.values;
        if (!values) return new Array(768).fill(0);
        const v = values.map((val: any) => isFinite(Number(val)) ? Number(val) : 0);
        if (v.length < 768) return [...v, ...new Array(768 - v.length).fill(0)];
        return v.slice(0, 768);
      });
      results.push(...vectors);
      
      // Prevent rate-limit spikes on batching
      if (i + CONCURRENCY_LIMIT < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (err: any) {
      console.warn(`Batch slice at index ${i} failed, using sequential fallback:`, err.message);
      for (const text of batchSlice) {
        try {
          results.push(await generateEmbedding(text));
        } catch (innerErr) {
          results.push(new Array(768).fill(0));
        }
      }
    }
  }
  return results;
}