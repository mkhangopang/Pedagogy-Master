import { GoogleGenAI } from "@google/genai";
import { embeddingCache } from "./embedding-cache";
import { performanceMonitor } from "../monitoring/performance";

/**
 * NEURAL TEXT SANITIZER
 * Ensures input strings are optimized for vectorization.
 */
function sanitizeText(text: string): string {
  if (!text) return " ";
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ') 
    .replace(/\s+/g, ' ')
    .trim() || " ";
}

/**
 * VECTOR SYNTHESIS ENGINE (v26.0)
 * MODEL: text-embedding-004 (768 dimensions)
 * Implements persistent caching and performance metrics.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const start = performance.now();
  const cleanText = sanitizeText(text);

  // 1. Persistent Cache Check
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

    // Force 768 dimensions for PostgreSQL HNSW compatibility
    const finalVector = vector.length === 768 ? vector : 
      (vector.length < 768 ? [...vector, ...new Array(768 - vector.length).fill(0)] : vector.slice(0, 768));
    
    // 2. Commit to Persistent Cache
    await embeddingCache.set(cleanText, finalVector);
    
    performanceMonitor.track('embedding_api_call', performance.now() - start);
    return finalVector;
  } catch (error: any) {
    console.error('❌ [Embedding Node] Fatal:', error.message);
    return new Array(768).fill(0);
  }
}

/**
 * BATCH VECTOR SYNTHESIS
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const results = await Promise.all(texts.map(t => generateEmbedding(t)));
  return results;
}