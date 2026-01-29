import { GoogleGenAI } from "@google/genai";
import { embeddingCache } from "./embedding-cache";
import { performanceMonitor } from "../monitoring/performance";

/**
 * NEURAL TEXT SANITIZER
 */
function sanitizeText(text: string): string {
  if (!text) return " ";
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ') 
    .replace(/\s+/g, ' ')
    .trim() || " ";
}

/**
 * SINGLE VECTOR SYNTHESIS
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const results = await generateEmbeddingsBatch([text]);
  return results[0];
}

/**
 * BATCH VECTOR SYNTHESIS (v32.0 - HIGH CONCURRENCY)
 * Fixed SDK property name from 'content' to 'contents'.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const start = performance.now();
  const sanitizedTexts = texts.map(t => sanitizeText(t));
  const finalResults: number[][] = new Array(texts.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  // 1. Resolve from Persistent Cache
  for (let i = 0; i < sanitizedTexts.length; i++) {
    const cached = await embeddingCache.get(sanitizedTexts[i]);
    if (cached) {
      finalResults[i] = cached;
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(sanitizedTexts[i]);
    }
  }

  if (uncachedTexts.length === 0) {
    performanceMonitor.track('embedding_batch_cache_full_hit', performance.now() - start);
    return finalResults as number[][];
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Fixed: 'contents' is the correct property for the latest SDK version
    const results = await Promise.all(uncachedTexts.map(text => 
      ai.models.embedContent({
        model: "text-embedding-004",
        contents: { parts: [{ text }] }
      })
    ));

    for (let i = 0; i < results.length; i++) {
      const vector = results[i].embedding?.values;
      if (!vector) continue;
      
      const originalIndex = uncachedIndices[i];
      
      // Strict Dimension Enforcement (768)
      let finalVector: number[];
      if (vector.length === 768) finalVector = vector;
      else if (vector.length < 768) finalVector = [...vector, ...new Array(768 - vector.length).fill(0)];
      else finalVector = vector.slice(0, 768);

      finalResults[originalIndex] = finalVector;
      
      // Commit back to cache (fire and forget)
      embeddingCache.set(uncachedTexts[i], finalVector).catch(() => {});
    }

    performanceMonitor.track('embedding_batch_api_call', performance.now() - start, { count: uncachedTexts.length });
    
    return finalResults.map(r => r || new Array(768).fill(0));
  } catch (error: any) {
    console.error('❌ [Batch Embedding] Grid Fault:', error.message);
    return finalResults.map(r => r || new Array(768).fill(0));
  }
}