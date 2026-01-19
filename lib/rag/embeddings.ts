import { GoogleGenAI } from "@google/genai";
import { embeddingCache } from "./embedding-cache";
import { performanceMonitor } from "../monitoring/performance";

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
 * VECTOR SYNTHESIS ENGINE (v25.0)
 * MODEL: text-embedding-004 (768 dimensions)
 * Now with high-speed caching and performance tracking.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const start = performance.now();
  const cleanText = sanitizeText(text);

  // 1. Check Cache
  const cached = await embeddingCache.get(cleanText);
  if (cached) {
    performanceMonitor.track('embedding_cache_hit', performance.now() - start);
    return cached;
  }

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

    const finalVector = vector.length === 768 ? vector : 
      (vector.length < 768 ? [...vector, ...new Array(768 - vector.length).fill(0)] : vector.slice(0, 768));
    
    // 2. Set Cache
    await embeddingCache.set(cleanText, finalVector);
    
    performanceMonitor.track('embedding_api_call', performance.now() - start);
    return finalVector;
  } catch (error: any) {
    console.error('[Embedding Error]:', error.message);
    return new Array(768).fill(0);
  }
}

/**
 * HIGH-SPEED BATCH EMBEDDER
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 10;
  const results: number[][] = new Array(texts.length);
  
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(text => generateEmbedding(text));
    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach((res, index) => { results[i + index] = res; });
    if (i + BATCH_SIZE < texts.length) await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return results;
}