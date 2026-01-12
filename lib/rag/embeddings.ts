
import { GoogleGenAI } from "@google/genai";

/**
 * GENERATE NEURAL EMBEDDING (Single)
 * Standardized for pgvector(768) compatibility.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  if (!apiKey) throw new Error('Neural Node Error: API_KEY is missing.');

  try {
    const ai = new GoogleGenAI({ apiKey });
    // Using text-embedding-004 for 768-dim vectors
    const response: any = await ai.models.embedContent({
      model: "text-embedding-004",
      content: { parts: [{ text: text || " " }] }
    });

    const result = response.embedding;
    if (!result?.values) throw new Error("Neural Node Error: Invalid vector response.");

    // Sanitize and validate numeric precision
    const vector = result.values.map((v: any) => {
      const n = Number(v);
      return isFinite(n) ? n : 0;
    });

    // Enforce strict 768 dimension length for pgvector
    if (vector.length < 768) {
      return [...vector, ...new Array(768 - vector.length).fill(0)];
    }
    return vector.slice(0, 768);
  } catch (error: any) {
    console.error('[Embedding Error]:', error);
    throw new Error(`Vector Synthesis Failed: ${error.message}`);
  }
}

/**
 * BATCH EMBEDDING SYNTHESIS
 * Uses parallelized single embedContent calls to bypass version-specific 
 * errors with the batchEmbedContents wrapper while maintaining performance.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  
  const CONCURRENCY_LIMIT = 5; // To avoid hitting rate limits
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += CONCURRENCY_LIMIT) {
    const chunk = texts.slice(i, i + CONCURRENCY_LIMIT);
    
    try {
      const chunkPromises = chunk.map(async (text) => {
        const response: any = await ai.models.embedContent({
          model: "text-embedding-004",
          content: { parts: [{ text: text || " " }] }
        });
        
        const values = response.embedding?.values;
        if (!values) throw new Error("Empty embedding result");
        
        const v = values.map((val: any) => isFinite(Number(val)) ? Number(val) : 0);
        if (v.length < 768) return [...v, ...new Array(768 - v.length).fill(0)];
        return v.slice(0, 768);
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    } catch (err: any) {
      console.error(`[Parallel Embedding Error] offset ${i}:`, err);
      // Failover to individual processing for this chunk
      for (const text of chunk) {
        results.push(await generateEmbedding(text));
      }
    }
  }
  
  return results;
}
