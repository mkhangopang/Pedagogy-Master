import { GoogleGenAI } from "@google/genai";

/**
 * NEURAL TEXT SANITIZER
 * Strips unsupported unicode escape sequences and normalizes text for the embedding engine.
 */
function sanitizeText(text: string): string {
  if (!text) return " ";
  return text
    .replace(/\\u[0-9a-fA-F]{4}/g, '') // Remove raw unicode escape sequences that cause API errors
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove non-printable control characters
    .normalize('NFKD') // Normalize unicode characters
    .replace(/[^\x20-\x7E\s]/g, '') // Strip remaining non-ASCII characters if still problematic (conservative)
    .trim() || " ";
}

/**
 * VECTOR SYNTHESIS ENGINE (v18.0)
 * MODEL: text-embedding-004 (768 dimensions)
 * This model MUST be used consistently for both indexing and retrieval.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('Neural Node Error: API_KEY missing for embeddings.');

  const cleanText = sanitizeText(text);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response: any = await ai.models.embedContent({
      model: "text-embedding-004", // REQUIRED MODEL
      contents: { parts: [{ text: cleanText }] } 
    });

    const result = response.embedding;
    if (!result?.values) throw new Error("Neural Node Error: Invalid vector response.");

    const vector = result.values.map((v: any) => {
      const n = Number(v);
      return isFinite(n) ? n : 0;
    });

    // Ensure 768 dimensions for PostgreSQL consistency
    if (vector.length < 768) {
      return [...vector, ...new Array(768 - vector.length).fill(0)];
    }
    return vector.slice(0, 768);
  } catch (error: any) {
    console.error('[Embedding Error]:', error);
    if (error.message?.includes('Unicode')) {
      console.warn("Attempting emergency fallback for Unicode failure node.");
      return new Array(768).fill(0);
    }
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
          model: "text-embedding-004", // REQUIRED MODEL
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
      console.warn(`Batch slice error at index ${i}, using fallback:`, err.message);
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