
import { GoogleGenAI } from "@google/genai";

export async function generateEmbedding(text: string): Promise<number[]> {
  // Fix: Strictly use process.env.API_KEY for initializing GoogleGenAI as per SDK guidelines.
  if (!process.env.API_KEY) throw new Error('Neural Node Error: API_KEY is missing for embeddings.');

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    const response: any = await ai.models.embedContent({
      model: "text-embedding-004",
      content: { parts: [{ text: text || " " }] }
    });

    const result = response.embedding;
    if (!result?.values) throw new Error("Neural Node Error: Invalid vector response.");

    const vector = result.values.map((v: any) => {
      const n = Number(v);
      return isFinite(n) ? n : 0;
    });

    // Ensure we return a consistent 768-dimensional vector
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
  
  // Fix: Strictly use process.env.API_KEY for initializing GoogleGenAI as per SDK guidelines.
  if (!process.env.API_KEY) throw new Error('Neural Node Error: API_KEY missing for batch embeddings.');
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const CONCURRENCY_LIMIT = 5; 
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += CONCURRENCY_LIMIT) {
    const batchSlice = texts.slice(i, i + CONCURRENCY_LIMIT);
    try {
      const promises = batchSlice.map(text => 
        ai.models.embedContent({
          model: "text-embedding-004",
          content: { parts: [{ text: text || " " }] }
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
      if (i + CONCURRENCY_LIMIT < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (err: any) {
      console.warn(`Batch slice starting at index ${i} failed, falling back to sequential:`, err);
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
