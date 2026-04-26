import { GoogleGenAI } from '@google/genai';
import { embeddingCache } from './embedding-cache';
import { performanceMonitor } from '../monitoring/performance';
import { resolveApiKey } from '../env-server';

function sanitizeText(text: string): string {
  if (!text) return ' ';
  return text.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim() || ' ';
}

// BUG-01 FIX: Sentinel value used to mark indices where embedding failed.
// These indices are EXCLUDED from insertion — never written as zero-vectors to pgvector.
const EMBEDDING_FAILED = Symbol('EMBEDDING_FAILED');

export class EmbeddingError extends Error {
  constructor(message: string, public readonly failedCount: number) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

async function callEmbeddingAPI(
  ai: GoogleGenAI,
  texts: string[],
  attempt: number
): Promise<number[][]> {
  const result = await ai.models.embedContent({
    model: 'text-embedding-004',
    contents: texts,
  });

  const rawEmbeddings = result.embeddings || [];
  if (rawEmbeddings.length !== texts.length) {
    throw new Error(
      `[Embedding] API returned ${rawEmbeddings.length} vectors for ${texts.length} texts (attempt ${attempt})`
    );
  }

  return rawEmbeddings.map((res: any) => {
    const rawVector = res.values || (Array.isArray(res) ? res : []);
    const numericVector: number[] = rawVector.map((v: any) => (typeof v === 'number' ? v : 0));
    let finalVector = numericVector.slice(0, 768);
    while (finalVector.length < 768) finalVector.push(0);
    return finalVector;
  });
}

export async function generateEmbeddingsBatch(
  texts: string[],
  /** When true, throws EmbeddingError instead of silently skipping failed items. */
  strict = false
): Promise<(number[] | null)[]> {
  const start = performance.now();
  const sanitizedTexts = texts.map(t => sanitizeText(t));
  const finalResults: (number[] | null)[] = new Array(texts.length).fill(null);
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

  if (uncachedTexts.length === 0) return finalResults;

  const apiKey = resolveApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured (server-side only)');

  const ai = new GoogleGenAI({ apiKey });

  // BUG-01 FIX: Retry up to 3 times before giving up on a batch.
  // On permanent failure, we mark indices as null (caller must skip insertion).
  // We NEVER write zero-vectors — they poison all semantic search results.
  const MAX_ATTEMPTS = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const vectors = await callEmbeddingAPI(ai, uncachedTexts, attempt);

      for (let i = 0; i < vectors.length; i++) {
        const originalIndex = uncachedIndices[i];
        finalResults[originalIndex] = vectors[i];
        embeddingCache.set(uncachedTexts[i], vectors[i]).catch(() => {});
      }

      performanceMonitor.track('embedding_batch_api_call', performance.now() - start, {
        count: uncachedTexts.length,
        attempts: attempt,
      });

      return finalResults;
    } catch (e: any) {
      lastError = e;
      const isQuota = /429|RESOURCE_EXHAUSTED|quota/i.test(e.message || '');
      console.error(`❌ [Embedding] Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${e.message}`);

      if (attempt < MAX_ATTEMPTS) {
        const delay = isQuota ? 5000 * attempt : 1000 * attempt;
        console.warn(`[Embedding] Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // All retries exhausted — do NOT return zero-vectors.
  const failedCount = uncachedTexts.length;
  console.error(`❌ [Embedding] Permanent failure for ${failedCount} texts after ${MAX_ATTEMPTS} attempts. Returning null for affected indices.`);

  if (strict) {
    throw new EmbeddingError(
      `Embedding API failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message}`,
      failedCount
    );
  }

  // Non-strict: return null for failed indices so caller can skip them
  return finalResults; // uncached indices remain null
}

/** Convenience wrapper that returns a single vector or throws. */
export async function generateEmbedding(text: string): Promise<number[]> {
  const results = await generateEmbeddingsBatch([text], true);
  const vec = results[0];
  if (!vec) throw new EmbeddingError('Embedding failed for single text', 1);
  return vec;
}
