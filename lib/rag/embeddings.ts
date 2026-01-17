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
 * VECTOR SYNTHESIS ENGINE (v24.0)
 * MODEL: text-embedding-004 (768 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const cleanText = sanitizeText(text);

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.embedContent({
      model: "text-embedding-004", 
      contents: [{ parts: [{ text: cleanText }] }] 
    });

    const vector = response.embeddings?.[0]?.values;

    if (!vector || vector.length === 0) {
      throw new Error("Invalid vector values returned.");
    }

    if (vector.length !== 768) {
      if (vector.length < 768) {
        return [...vector, ...new Array(768 - vector.length).fill(0)];
      }
      return vector.slice(0, 768);
    }
    
    return vector;
  } catch (error: any) {
    console.error('[Embedding Error]:', error.message);
    return new Array(768).fill(0); // Return zero-vector fallback to keep indexing alive
  }
}

/**
 * HIGH-SPEED BATCH EMBEDDER
 * Processes chunks in parallel batches to optimize ingestion time.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 10; // Parallel processing limit
  const results: number[][] = new Array(texts.length);
  
  console.log(`📡 [Embedder] Processing ${texts.length} chunks in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(text => generateEmbedding(text));
    
    const batchResults = await Promise.all(batchPromises);
    
    batchResults.forEach((res, index) => {
      results[i + index] = res;
    });
    
    // Tiny delay between batches to respect Gemini rate limits
    if (i + BATCH_SIZE < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}