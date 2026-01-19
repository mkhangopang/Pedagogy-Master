/**
 * NEURAL EMBEDDING CACHE (v1.0)
 * Reduces redundant API calls to Google embedding nodes.
 * Structure ready for Redis/Upstash migration.
 */
class EmbeddingCache {
  private cache = new Map<string, { vector: number[]; timestamp: number }>();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 Hour TTL
  private readonly MAX_ENTRIES = 1000;

  private normalizeKey(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  async get(text: string): Promise<number[] | null> {
    const key = this.normalizeKey(text);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }

    console.log('⚡ [Vector Cache] Hit for query embedding.');
    return entry.vector;
  }

  async set(text: string, vector: number[]): Promise<void> {
    const key = this.normalizeKey(text);
    
    // Eviction policy: LRU-lite
    if (this.cache.size >= this.MAX_ENTRIES) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, { vector, timestamp: Date.now() });
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_ENTRIES,
      utilization: ((this.cache.size / this.MAX_ENTRIES) * 100).toFixed(1) + '%'
    };
  }
}

export const embeddingCache = new EmbeddingCache();