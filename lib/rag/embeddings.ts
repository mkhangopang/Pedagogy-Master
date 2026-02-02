
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
 * BATCH VECTOR SYNTHESIS (v36.0 - PRODUCTION STABILIZED)
 * FIX: Robust extraction of number[] to prevent "invalid input syntax for type vector" errors.
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
    if (cached && Array.isArray(cached) && typeof cached[0] === 'number') {
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
    
    // Execute embeddings in parallel
    const results = await Promise.all(uncachedTexts.map(text => 
      ai.models.embedContent({
        model: "text-embedding-004",
        contents: { parts: [{ text }] }
      })
    ));

    for (let i = 0; i < results.length; i++) {
      const res = results[i] as any;
      const originalIndex = uncachedIndices[i];
      
      // STABILIZED EXTRACTION: Navigate potentially inconsistent API response structures
      let rawVector: any = null;
      
      if (res.embedding?.values && Array.isArray(res.embedding.values)) {
        rawVector = res.embedding.values;
      } else if (res.embedding && Array.isArray(res.embedding)) {
        rawVector = res.embedding;
      } else if (res.values && Array.isArray(res.values)) {
        rawVector = res.values;
      } else if (Array.isArray(res)) {
        rawVector = res;
      }

      if (!rawVector || !Array.isArray(rawVector)) {
        console.warn(`[Embeddings] Node ${i} returned invalid structure. Falling back to zero-vector.`);
        rawVector = new Array(768).fill(0);
      }

      // Ensure all elements are numbers (flattening if it's accidentally nested)
      const numericVector: number[] = rawVector.map((v: any) => 
        typeof v === 'number' ? v : (v?.values && typeof v.values[0] === 'number' ? v.values[0] : 0)
      );
      
      // Strict Dimension Enforcement (768)
      let finalVector: number[];
      if (numericVector.length === 768) {
        finalVector = numericVector;
      } else if (numericVector.length < 768) {
        finalVector = [...numericVector, ...new Array(768 - numericVector.length).fill(0)];
      } else {
        finalVector = numericVector.slice(0, 768);
      }

      finalResults[originalIndex] = finalVector;
      
      // Commit back to cache
      embeddingCache.set(uncachedTexts[i], finalVector).catch(() => {});
    }

    performanceMonitor.track('embedding_batch_api_call', performance.now() - start, { count: uncachedTexts.length });
    
    return finalResults.map(r => r || new Array(768).fill(0));
  } catch (error: any) {
    console.error('❌ [Batch Embedding] Grid Fault:', error.message);
    // Return zero-vectors to prevent crashing the ingestion pipeline
    return finalResults.map(r => r || new Array(768).fill(0));
  }
}
