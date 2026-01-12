
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
    // Use the fully qualified model name
    const model = "models/text-embedding-004";
    
    const response: any = await (ai as any).models.embedContent({
      model,
      content: { parts: [{ text: text || " " }] }
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
 * Uses Gemini's native batchEmbedContents for maximum throughput.
 * FIXED: Each individual request in the array must have its own 'model' property.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  if (!apiKey) throw new Error('Neural Node Error: API_KEY is missing.');
  
  const ai = new GoogleGenAI({ apiKey });
  const model = "models/text-embedding-004";
  
  const NATIVE_BATCH_SIZE = 100; 
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += NATIVE_BATCH_SIZE) {
    const batchTexts = texts.slice(i, i + NATIVE_BATCH_SIZE);
    
    try {
      // The Gemini API requires the 'requests' array to contain objects with 'model' and 'content'
      const batchResponse: any = await (ai as any).models.batchEmbedContents({
        requests: batchTexts.map(text => ({
          model,
          content: { parts: [{ text: text || " " }] }
        }))
      });

      if (!batchResponse.embeddings) throw new Error("Empty batch response from neural node.");

      const vectors = batchResponse.embeddings.map((emb: any) => {
        const v = emb.values.map((val: any) => isFinite(Number(val)) ? Number(val) : 0);
        // Standardize dimensions
        if (v.length < 768) return [...v, ...new Array(768 - v.length).fill(0)];
        return v.slice(0, 768);
      });

      results.push(...vectors);
    } catch (err: any) {
      console.warn(`[Batch Embedding Warning] offset ${i}, falling back to sequential:`, err);
      // Fallback logic to ensure robustness
      for (const text of batchTexts) {
        results.push(await generateEmbedding(text));
      }
    }
  }
  
  return results;
}
