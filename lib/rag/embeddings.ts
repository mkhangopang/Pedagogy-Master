
import { GoogleGenAI } from "@google/genai";

/**
 * GENERATE NEURAL EMBEDDING (Single)
 * Standardized for pgvector(768) compatibility.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Support both standard and Vercel-specific API key names
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  if (!apiKey) throw new Error('Neural Node Error: API_KEY is missing.');

  try {
    const ai = new GoogleGenAI({ apiKey });
    // Using text-embedding-004 which produces 768-dim vectors
    // The SDK expects 'contents' (plural) as an array of Content objects
    const response: any = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text: text || " " }] }]
    });

    const result = response.embedding;
    if (!result?.values) throw new Error("Neural Node Error: Invalid vector response.");

    // Sanitize and validate numeric precision to prevent DB syntax errors
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
 * Since batchEmbedContents is not available on the Models object, 
 * we execute parallelized single embedContent calls with concurrency control.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  
  // We process in small concurrent chunks to avoid hitting API rate limits 
  // while still gaining speed over sequential processing.
  const CONCURRENCY_LIMIT = 5; 
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += CONCURRENCY_LIMIT) {
    const batchSlice = texts.slice(i, i + CONCURRENCY_LIMIT);
    
    try {
      const promises = batchSlice.map(text => 
        ai.models.embedContent({
          model: "text-embedding-004",
          contents: [{ parts: [{ text: text || " " }] }]
        })
      );

      const batchResponses = await Promise.all(promises);

      const vectors = batchResponses.map((response: any) => {
        const values = response.embedding?.values;
        if (!values) return new Array(768).fill(0);
        
        const v = values.map((val: any) => isFinite(Number(val)) ? Number(val) : 0);
        // Standardize dimensions to 768
        if (v.length < 768) return [...v, ...new Array(768 - v.length).fill(0)];
        return v.slice(0, 768);
      });

      results.push(...vectors);
      
      // Small pause between batches if there are more to process
      if (i + CONCURRENCY_LIMIT < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (err: any) {
      console.warn(`[Parallel Embedding Warning] offset ${i}, falling back to sequential for this slice:`, err);
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
