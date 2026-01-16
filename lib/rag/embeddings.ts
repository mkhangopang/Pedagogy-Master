import { GoogleGenAI } from "@google/genai";

/**
 * NEURAL TEXT SANITIZER
 * Ensures input strings don't crash the embedding node.
 */
function sanitizeText(text: string): string {
  if (!text) return " ";
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ') 
    .replace(/\\u[0-9a-fA-F]{4}/g, '') 
    .normalize('NFKD')
    .replace(/[^\x20-\x7E\s]/g, '') 
    .replace(/\s+/g, ' ')
    .trim() || " ";
}

/**
 * VECTOR SYNTHESIS ENGINE (v20.0 - PRODUCTION)
 * MODEL: text-embedding-004 (Fixed at 768 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('Neural Node Error: API_KEY missing.');

  const cleanText = sanitizeText(text);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response: any = await ai.models.embedContent({
      model: "text-embedding-004", 
      contents: { parts: [{ text: cleanText }] } 
    });

    const result = response.embedding;
    if (!result?.values) throw new Error("Invalid vector response.");

    const vector = result.values.map((v: any) => isFinite(Number(v)) ? Number(v) : 0);

    // Enforce strict 768d dimensionality for pgvector compliance
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
  if (!apiKey) throw new Error('API_KEY missing.');
  
  const ai = new GoogleGenAI({ apiKey });
  const CONCURRENCY_LIMIT = 5; 
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += CONCURRENCY_LIMIT) {
    const batchSlice = texts.slice(i, i + CONCURRENCY_LIMIT);
    try {
      const promises = batchSlice.map(text => 
        ai.models.embedContent({
          model: "text-embedding-004",
          contents: { parts: [{ text: sanitizeText(text) }] }
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
      console.warn(`[Embedder] Batch node error, falling back to sequential...`);
      for (const text of batchSlice) {
        try { results.push(await generateEmbedding(text)); } 
        catch { results.push(new Array(768).fill(0)); }
      }
    }
  }
  return results;
}