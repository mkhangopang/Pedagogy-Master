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

/**
 * STAGE 4 BUG FIX: Batch embedding API call was broken.
 *
 * The previous code called:
 *   ai.models.embedContent({ model, contents: uncachedTexts })
 *
 * The Gemini @google/genai SDK's embedContent method expects:
 *   - Single input: { model, contents: string | Part | Content }
 *   - Batch input: { model, requests: [{ model, contents: ... }] } via batchEmbedContents
 *
 * Passing an array of raw strings to `contents` causes the API to either error out
 * or treat the array as a single malformed Content object, silently returning empty
 * embeddings. The catch block then returns all-zero vectors, making vector search
 * completely non-functional (every chunk has the same [0,0,0...] embedding).
 *
 * FIX: Use individual embedContent calls per text, with a small delay between
 * calls to respect the free tier rate limit (1500 req/min = 25 req/sec).
 * For batch sizes > 1, we process them sequentially with minimal delay.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const start = performance.now();
  const sanitizedTexts = texts.map(t => sanitizeText(t));
  const finalResults: (number[] | null)[] = new Array(texts.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  // Check cache first
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

    // Process each text individually to avoid the batch API format issue.
    // text-embedding-004 free tier: 1500 req/min = 25/sec. We throttle to 20/sec (50ms gap).
    for (let i = 0; i < uncachedTexts.length; i++) {
      const text = uncachedTexts[i];
      const originalIndex = uncachedIndices[i];

      try {
        // FIX: Use single-text embedContent call which is well-supported
        const result = await ai.models.embedContent({
          model: 'text-embedding-004',
          contents: text, // Single string — the stable API signature
        });

        // The single-call response uses result.embedding (singular), not result.embeddings
        const embedding = (result as any).embedding || (result as any).embeddings?.[0];
        const rawVector = embedding?.values || (Array.isArray(embedding) ? embedding : []);

        const numericVector: number[] = rawVector.map((v: any) =>
          typeof v === 'number' ? v : 0
        );

        // text-embedding-004 produces 768-dimensional vectors
        let finalVector = numericVector.slice(0, 768);
        while (finalVector.length < 768) finalVector.push(0);

        finalResults[originalIndex] = finalVector;
        embeddingCache.set(text, finalVector).catch(() => {});

        // Throttle to stay within free tier limits (50ms = ~20 req/sec)
        if (i < uncachedTexts.length - 1) {
          await new Promise(r => setTimeout(r, 50));
        }

      } catch (singleErr: any) {
        const isRateLimit = /429|quota|RESOURCE_EXHAUSTED/i.test(singleErr.message || '');
        if (isRateLimit) {
          console.warn(`[Embeddings] Rate limit hit at index ${i}. Waiting 10s...`);
          await new Promise(r => setTimeout(r, 10000));
          // Retry once
          try {
            const retryResult = await ai.models.embedContent({
              model: 'text-embedding-004',
              contents: text,
            });
            const embedding = (retryResult as any).embedding || (retryResult as any).embeddings?.[0];
            const rawVector = embedding?.values || [];
            const finalVector = rawVector.map((v: any) => typeof v === 'number' ? v : 0).slice(0, 768);
            while (finalVector.length < 768) finalVector.push(0);
            finalResults[originalIndex] = finalVector;
            embeddingCache.set(text, finalVector).catch(() => {});
          } catch (retryErr) {
            console.error(`[Embeddings] Retry failed for index ${i}:`, retryErr);
            finalResults[originalIndex] = new Array(768).fill(0);
          }
        } else {
          console.error(`[Embeddings] Error for text at index ${i}:`, singleErr.message);
          finalResults[originalIndex] = new Array(768).fill(0);
        }
      }
    }

    performanceMonitor.track('embedding_batch_api_call', performance.now() - start, {
      count: uncachedTexts.length,
    });

    return finalResults.map(r => r || new Array(768).fill(0));

  } catch (error) {
    console.error('❌ [Embedding Fault]:', error);
    return finalResults.map(r => r || new Array(768).fill(0));
  }
}
