
export interface ProviderConfig {
  name: string;
  rpm: number; 
  rpd: number; 
  enabled: boolean;
}

interface RateLimitState {
  minuteCount: number;
  dayCount: number;
  minuteResetTime: number;
  dayResetTime: number;
}

class RateLimiter {
  private states = new Map<string, RateLimitState>();

  canMakeRequest(provider: string, config: ProviderConfig): boolean {
    const now = Date.now();
    const state = this.getState(provider);

    if (now >= state.minuteResetTime) {
      state.minuteCount = 0;
      state.minuteResetTime = now + 60000;
    }

    if (now >= state.dayResetTime) {
      state.dayCount = 0;
      state.dayResetTime = now + 86400000;
    }

    return state.minuteCount < config.rpm && state.dayCount < config.rpd && config.enabled;
  }

  trackRequest(provider: string): void {
    const state = this.getState(provider);
    state.minuteCount++;
    state.dayCount++;
    this.states.set(provider, state);
  }

  getState(provider: string): RateLimitState {
    if (!this.states.has(provider)) {
      const now = Date.now();
      this.states.set(provider, {
        minuteCount: 0,
        dayCount: 0,
        minuteResetTime: now + 60000,
        dayResetTime: now + 86400000,
      });
    }
    return this.states.get(provider)!;
  }

  getRemainingRequests(provider: string, config: ProviderConfig): {
    minute: number;
    day: number;
  } {
    const state = this.getState(provider);
    return {
      minute: Math.max(0, config.rpm - state.minuteCount),
      day: Math.max(0, config.rpd - state.dayCount),
    };
  }
}

export const rateLimiter = new RateLimiter();
