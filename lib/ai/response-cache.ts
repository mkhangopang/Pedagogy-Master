
interface CacheEntry {
  response: string;
  timestamp: number;
  provider: string;
}

class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = 10 * 60 * 1000; // 10 minutes
  private readonly MAX_ENTRIES = 200;

  private normalizeKey(prompt: string, history: any[]): string {
    const recentHistory = history.slice(-2).map(m => m.content).join('|');
    return `${prompt.toLowerCase().trim()}::${recentHistory}`;
  }

  get(prompt: string, history: any[]): string | null {
    const key = this.normalizeKey(prompt, history);
    const entry = this.cache.get(key);

    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }

    console.log(`✅ AI Cache hit: ${entry.provider}`);
    return entry.response;
  }

  set(prompt: string, history: any[], response: string, provider: string): void {
    const key = this.normalizeKey(prompt, history);
    this.cache.set(key, { response, timestamp: Date.now(), provider });

    if (this.cache.size > this.MAX_ENTRIES) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.cache.delete(oldestKey);
    }
  }

  getStats() {
    return { size: this.cache.size, maxSize: this.MAX_ENTRIES };
  }
}

export const responseCache = new ResponseCache();
