import { kv } from '../kv';
// Add missing Buffer import for Base64 encoding
import { Buffer } from 'buffer';

/**
 * NEURAL EMBEDDING CACHE (v2.0 - PERSISTENT)
 * Leverages KV utility for cross-session vector persistence.
 */
class EmbeddingCache {
  private readonly TTL_SECONDS = 86400; // 24 Hours

  private normalizeKey(text: string): string {
    // Generate a simple hash-like key to prevent overly long Redis keys
    const clean = text.toLowerCase().trim().replace(/\s+/g, ' ');
    return `v_cache:${Buffer.from(clean).toString('base64').substring(0, 100)}`;
  }

  async get(text: string): Promise<number[] | null> {
    const key = this.normalizeKey(text);
    const vector = await kv.get<number[]>(key);
    if (vector) {
      console.log('⚡ [Vector Cache] Persistent Hit.');
    }
    return vector;
  }

  async set(text: string, vector: number[]): Promise<void> {
    const key = this.normalizeKey(text);
    await kv.set(key, vector, this.TTL_SECONDS);
  }

  // Add getStats method for the metrics reporting dashboard
  getStats() {
    return {
      status: 'active',
      ttl: this.TTL_SECONDS,
      provider: 'persistent_kv'
    };
  }
}

export const embeddingCache = new EmbeddingCache();