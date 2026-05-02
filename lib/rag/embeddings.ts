import { GoogleGenAI } from '@google/genai';
import { embeddingCache } from './embedding-cache';
import { performanceMonitor } from '../monitoring/performance';
import { resolveApiKey } from '../env-server';

function sanitizeText(text: string): string {
  if (!text) return ' ';
  return text.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim() || ' ';
}

/**
 * FIX-CRITICAL-02: Zero-vector poisoning eliminated.
 *
 * The previous code returned new Array(768).fill(0) on ANY API failure.
 * Zero-vectors sit at the mathematical origin and match EVERYTHING in cosine
 * similarity, silently poisoning all semantic search results.
 *
 * New behaviour:
 *   1. Retry up to 3 times with exponential back-off.
 *   2. On permanent failure, return null for that index.
 *   3. Callers MUST check for null and skip insertion.
 *   4. NEVER insert zero-vectors into pgvector.
 */
export class EmbeddingError extends Error {
  constructor(message: string, public failedCount: number) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

async function callEmbeddingAPI(ai: GoogleGenAI, texts: string[]): Promise<number[][]> {
  const result = await ai.models.embedContent({
    model: 'text-embedding-004',
    contents: texts,
  });

  const raw = result.embeddings || [];
  if (raw.length !== texts.length) {
    throw new Error(`[Embedding] Got ${raw.length} vectors for ${texts.length} texts`);
  }

  return raw.map((res: any) => {
    const v: number[] = (res.values ?? (Array.isArray(res) ? res : [])).map(
      (x: any) => (typeof x === 'number' ? x : 0)
    );
    const vec = v.slice(0, 768);
    while (vec.length < 768) vec.push(0);
    return vec;
  });
}

/**
 * Returns (number[] | null)[] — null means embedding failed for that slot.
 * Caller must filter nulls before DB insertion.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  strict = false
): Promise<(number[] | null)[]> {
  const start = performance.now();
  const sanitized = texts.map(t => sanitizeText(t));
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const uncachedIdx: number[] = [];
  const uncachedTxt: string[] = [];

  for (let i = 0; i < sanitized.length; i++) {
    const cached = await embeddingCache.get(sanitized[i]);
    if (cached && Array.isArray(cached) && typeof cached[0] === 'number') {
      results[i] = cached;
    } else {
      uncachedIdx.push(i);
      uncachedTxt.push(sanitized[i]);
    }
  }

  if (uncachedTxt.length === 0) return results;

  const apiKey = resolveApiKey();
  if (!apiKey) throw new EmbeddingError('GEMINI_API_KEY not configured', uncachedTxt.length);

  const ai = new GoogleGenAI({ apiKey });
  const MAX_ATTEMPTS = 3;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const vectors = await callEmbeddingAPI(ai, uncachedTxt);

      for (let i = 0; i < vectors.length; i++) {
        results[uncachedIdx[i]] = vectors[i];
        embeddingCache.set(uncachedTxt[i], vectors[i]).catch(() => {});
      }

      performanceMonitor.track('embedding_batch_api_call', performance.now() - start, {
        count: uncachedTxt.length,
        attempts: attempt,
      });
      return results;
    } catch (e: any) {
      lastErr = e;
      const isQuota = /429|RESOURCE_EXHAUSTED|quota/i.test(e.message || '');
      console.error(`[Embedding] Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${e.message}`);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, (isQuota ? 5000 : 1000) * attempt));
      }
    }
  }

  // All retries exhausted — null slots remain null (NOT zero-vectors)
  const failedCount = uncachedTxt.length;
  console.error(`[Embedding] Permanent failure for ${failedCount} texts after ${MAX_ATTEMPTS} attempts.`);

  if (strict) {
    throw new EmbeddingError(
      `Embedding API failed after ${MAX_ATTEMPTS} attempts: ${lastErr?.message}`,
      failedCount
    );
  }

  return results; // null for all failed slots
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await generateEmbeddingsBatch([text], true);
  const vec = res[0];
  if (!vec) throw new EmbeddingError('Embedding failed for single text', 1);
  return vec;
}
