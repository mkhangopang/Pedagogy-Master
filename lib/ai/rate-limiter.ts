import { kv } from '../kv';

export interface ProviderConfig {
  name: string;
  rpm: number; 
  rpd: number; 
  enabled: boolean;
}

interface RateLimitState {
  minuteCount: number;
  dayCount: number;
  minuteReset: number;
  dayReset: number;
}

/**
 * PERSISTENT RATE LIMITER (v2.0)
 * Uses KV store for cross-instance enforcement.
 */
class RateLimiter {
  async canMakeRequest(provider: string, config: ProviderConfig): Promise<boolean> {
    if (!config.enabled) return false;
    
    const now = Date.now();
    const key = `ratelimit:${provider}`;
    let state = await kv.get<RateLimitState>(key);

    if (!state || now > state.dayReset) {
      state = { minuteCount: 0, dayCount: 0, minuteReset: now + 60000, dayReset: now + 86400000 };
    } else if (now > state.minuteReset) {
      state.minuteCount = 0;
      state.minuteReset = now + 60000;
    }

    const allowed = state.minuteCount < config.rpm && state.dayCount < config.rpd;
    
    if (allowed) {
      state.minuteCount++;
      state.dayCount++;
      await kv.set(key, state, 86400); // 1 day TTL
    }

    return allowed;
  }

  // Add trackRequest method to support calls from synthesizer-core
  trackRequest(provider: string) {
    // Current implementation already tracks usage within canMakeRequest
    // to ensure atomic operations. This method is provided for API compatibility.
    return;
  }

  async getRemainingRequests(provider: string, config: ProviderConfig) {
    const key = `ratelimit:${provider}`;
    const state = await kv.get<RateLimitState>(key);
    if (!state) return { minute: config.rpm, day: config.rpd };
    
    return {
      minute: Math.max(0, config.rpm - state.minuteCount),
      day: Math.max(0, config.rpd - state.dayCount)
    };
  }
}

export const rateLimiter = new RateLimiter();