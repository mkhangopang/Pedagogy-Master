/**
 * NEURAL KV INTERFACE (v2.0)
 * Unified storage for Rate Limits and Vector Caching.
 * AUDIT IMPLEMENTATION: Cache Leasing to prevent thundering herds.
 */
class KVStore {
  private memory = new Map<string, { value: any; expiry: number }>();
  private leases = new Set<string>(); // Active fetch locks
  private redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  private redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  private isRedisActive(): boolean {
    return !!(this.redisUrl && this.redisToken);
  }

  /**
   * Acquire a temporary lease (lock) on a key to prevent redundant AI calls.
   */
  async acquireLease(key: string, timeoutMs: number = 5000): Promise<boolean> {
    if (this.leases.has(key)) return false;
    this.leases.add(key);
    setTimeout(() => this.leases.delete(key), timeoutMs);
    return true;
  }

  async releaseLease(key: string): Promise<void> {
    this.leases.delete(key);
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.isRedisActive()) {
      try {
        const res = await fetch(`${this.redisUrl}/get/${key}`, {
          headers: { Authorization: `Bearer ${this.redisToken}` }
        });
        const data = await res.json();
        return data.result ? JSON.parse(data.result) : null;
      } catch (e) {
        console.warn('⚠️ [KV] Redis Fetch Error, falling back to memory.');
      }
    }

    const entry = this.memory.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.memory.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    if (this.isRedisActive()) {
      try {
        await fetch(`${this.redisUrl}/set/${key}/${JSON.stringify(value)}/EX/${ttlSeconds}`, {
          headers: { Authorization: `Bearer ${this.redisToken}` }
        });
        return;
      } catch (e) {
        console.warn('⚠️ [KV] Redis Set Error.');
      }
    }

    this.memory.set(key, {
      value,
      expiry: Date.now() + (ttlSeconds * 1000)
    });

    // Simple GC for memory store
    if (this.memory.size > 2000) {
      const first = this.memory.keys().next().value;
      if (first) this.memory.delete(first);
    }
  }

  async delete(key: string): Promise<void> {
    if (this.isRedisActive()) {
      await fetch(`${this.redisUrl}/del/${key}`, {
        headers: { Authorization: `Bearer ${this.redisToken}` }
      });
    }
    this.memory.delete(key);
  }
}

export const kv = new KVStore();
