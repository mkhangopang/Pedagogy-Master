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
 * VECTOR SYNTHESIS ENGINE (v27.0)
 * MODEL: text-embedding-004 (768 dimensions)
 * Implements strict dimension enforcement to match PostgreSQL HNSW.
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

    // STRICT DIMENSION ENFORCEMENT (Must be 768)
    let finalVector: number[];
    if (vector.length === 768) {
      finalVector = vector;
    } else if (vector.length < 768) {
      console.warn(`[Embedding] Zero-padding vector from ${vector.length} to 768.`);
      finalVector = [...vector, ...new Array(768 - vector.length).fill(0)];
    } else {
      console.warn(`[Embedding] Truncating vector from ${vector.length} to 768.`);
      finalVector = vector.slice(0, 768);
    }
    
    // 2. Commit to Persistent Cache
    await embeddingCache.set(cleanText, finalVector);
    
    performanceMonitor.track('embedding_api_call', performance.now() - start);
    return finalVector;
  } catch (error: any) {
    console.error('❌ [Embedding Node] Fatal:', error.message);
    // Return zeros rather than crashing, to allow RAG to proceed with FTS fallback
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