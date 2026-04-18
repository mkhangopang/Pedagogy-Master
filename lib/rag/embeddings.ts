import { GoogleGenAI } from '@google/genai';
import { embeddingCache } from './embedding-cache';
import { performanceMonitor } from '../monitoring/performance';
import { resolveApiKey } from '../env-server';

function sanitizeText(text: string): string {
  if (!text) return ' ';
  return text.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim() || ' ';
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const results = await generateEmbeddingsBatch([text]);
  return results[0];
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const start = performance.now();
  const sanitizedTexts = texts.map(t => sanitizeText(t));
  const finalResults: number[][] = new Array(texts.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  for (let i = 0; i < sanitizedTexts.length; i++) {
    const cached = await embeddingCache.get(sanitizedTexts[i]);
    if (cached && Array.isArray(cached) && typeof cached[0] === 'number') {
      finalResults[i] = cached;
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(sanitizedTexts[i]);
    }
  }

  if (uncachedTexts.length === 0) return finalResults as number[][];

  try {
    const apiKey = resolveApiKey();
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured (server-side only)');

    const ai = new GoogleGenAI({ apiKey });

    // FIX-BUG-01: Correct embedding model — "gemini-embedding-2-preview" does not exist.
    // "text-embedding-004" is the stable, production Gemini embedding model (768 dims).
    const result = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: uncachedTexts,
    });

    const rawEmbeddings = result.embeddings || [];

    for (let i = 0; i < rawEmbeddings.length; i++) {
      const res = rawEmbeddings[i] as any;
      const originalIndex = uncachedIndices[i];

      const rawVector = res.values || (Array.isArray(res) ? res : []);
      const numericVector: number[] = rawVector.map((v: any) =>
        typeof v === 'number' ? v : 0
      );

      // text-embedding-004 produces 768-dimensional vectors
      let finalVector = numericVector.slice(0, 768);
      while (finalVector.length < 768) finalVector.push(0);

      finalResults[originalIndex] = finalVector;
      // FIX: Use the correct index for uncachedTexts
      embeddingCache.set(uncachedTexts[i], finalVector).catch(() => {});
    }

    performanceMonitor.track('embedding_batch_api_call', performance.now() - start, {
      count: uncachedTexts.length,
    });
    return finalResults.map(r => r || new Array(768).fill(0));
  } catch (error) {
    console.error('❌ [Embedding Fault]:', error);
    // Return zero vectors as fallback so indexing doesn't crash entirely
    return finalResults.map(r => r || new Array(768).fill(0));
  }
}
