import { GoogleGenAI } from "@google/genai";
import { isGeminiEnabled } from '../env-server';

/**
 * OPTIMIZED 7-NODE NEURAL GRID v10.0
 * Features: Smart Load Balancing, Tiered Priority, and Auto-Failover.
 */

// Add comment above each fix
// Fix: Export AIProvider interface to allow external access to provider configuration details
export interface AIProvider {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  apiKeyEnv: string;
  maxTokens: number;
  rateLimit: number; // RPM
  tier: 1 | 2;
  enabled: boolean;
}

interface RateLimitTracker {
  requestCount: number;
  windowStart: number;
  lastRequest: number;
}

export class SynthesizerCore {
  private providers: Map<string, AIProvider>;
  private rateLimits: Map<string, RateLimitTracker>;
  private failedProviders: Set<string>;

  constructor() {
    this.providers = this.initializeProviders();
    this.rateLimits = new Map();
    this.failedProviders = new Set();
    
    this.providers.forEach((_, id) => {
      this.rateLimits.set(id, {
        requestCount: 0,
        windowStart: Date.now(),
        lastRequest: 0
      });
    });
  }

  private initializeProviders(): Map<string, AIProvider> {
    const providers = new Map<string, AIProvider>();

    // TIER 1: PRIMARY NODES
    providers.set('gemini-flash', {
      id: 'gemini-flash',
      name: 'Gemini 3 Flash',
      endpoint: 'native',
      model: 'gemini-3-flash-preview',
      apiKeyEnv: 'API_KEY',
      maxTokens: 8192,
      rateLimit: 50,
      tier: 1,
      enabled: isGeminiEnabled()
    });

    providers.set('deepseek', {
      id: 'deepseek',
      name: 'DeepSeek R1',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      maxTokens: 8192,
      rateLimit: 30,
      tier: 1,
      enabled: !!process.env.DEEPSEEK_API_KEY
    });

    providers.set('groq', {
      id: 'groq',
      name: 'Groq Llama 3.3',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile',
      apiKeyEnv: 'GROQ_API_KEY',
      maxTokens: 4096,
      rateLimit: 30,
      tier: 1,
      enabled: !!process.env.GROQ_API_KEY
    });

    // TIER 2: SPECIALIZED FALLBACKS
    providers.set('cerebras', {
      id: 'cerebras',
      name: 'Cerebras Ultra',
      endpoint: 'https://api.cerebras.ai/v1/chat/completions',
      model: 'llama3.1-70b', 
      apiKeyEnv: 'CEREBRAS_API_KEY',
      maxTokens: 4096,
      rateLimit: 15,
      tier: 2,
      enabled: !!process.env.CEREBRAS_API_KEY
    });

    providers.set('sambanova', {
      id: 'sambanova',
      name: 'SambaNova XL',
      endpoint: 'https://api.sambanova.ai/v1/chat/completions',
      model: 'Meta-Llama-3.1-405B-Instruct', 
      apiKeyEnv: 'SAMBANOVA_API_KEY',
      maxTokens: 4096,
      rateLimit: 15,
      tier: 2,
      enabled: !!process.env.SAMBANOVA_API_KEY
    });

    providers.set('hyperbolic', {
      id: 'hyperbolic',
      name: 'Hyperbolic Llama',
      endpoint: 'https://api.hyperbolic.xyz/v1/chat/completions',
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      apiKeyEnv: 'HYPERBOLIC_API_KEY',
      maxTokens: 4096,
      rateLimit: 20,
      tier: 2,
      enabled: !!process.env.HYPERBOLIC_API_KEY
    });

    providers.set('openrouter', {
      id: 'openrouter',
      name: 'OpenRouter Hub',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'meta-llama/llama-3.3-70b-instruct',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      maxTokens: 4096,
      rateLimit: 20,
      tier: 2,
      enabled: !!process.env.OPENROUTER_API_KEY
    });

    return providers;
  }

  private async selectProvider(type: 'map' | 'reduce' | 'chat'): Promise<AIProvider | null> {
    const isReduce = type === 'reduce';
    
    // REDUCE phase priority
    const candidates = Array.from(this.providers.values())
      .filter(p => p.enabled && !this.failedProviders.has(p.id))
      .sort((a, b) => {
        if (isReduce) {
          if (a.id === 'gemini-flash') return -1;
          if (b.id === 'gemini-flash') return 1;
        }
        if (a.tier !== b.tier) return a.tier - b.tier;
        const aT = this.rateLimits.get(a.id)!;
        const bT = this.rateLimits.get(b.id)!;
        return aT.requestCount - bT.requestCount;
      });

    for (const provider of candidates) {
      if (await this.checkRateLimit(provider.id)) return provider;
    }
    return candidates.length > 0 ? candidates[0] : null;
  }

  private async checkRateLimit(id: string): Promise<boolean> {
    const provider = this.providers.get(id);
    const tracker = this.rateLimits.get(id);
    if (!provider || !tracker) return false;

    const now = Date.now();
    if (now - tracker.windowStart > 60000) {
      tracker.requestCount = 0;
      tracker.windowStart = now;
    }

    if (tracker.requestCount < provider.rateLimit) {
      const minInterval = 60000 / provider.rateLimit;
      const elapsed = now - tracker.lastRequest;
      if (elapsed < minInterval) await new Promise(r => setTimeout(r, minInterval - elapsed));
      return true;
    }
    return false;
  }

  public async synthesize(prompt: string, options: any = {}): Promise<any> {
    const type = options.type || 'chat';
    const provider = await this.selectProvider(type);
    if (!provider) throw new Error('GRID_EXHAUSTED: No active neural nodes.');

    console.log(`🛰️ [Neural Grid] Engaging: ${provider.name.toUpperCase()}`);

    try {
      let content = "";
      if (provider.endpoint === 'native') {
        const ai = new GoogleGenAI({ apiKey: process.env[provider.apiKeyEnv]! });
        const res = await ai.models.generateContent({
          model: provider.model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { temperature: options.temperature || 0.1, maxOutputTokens: provider.maxTokens }
        });
        content = res.text || "";
      } else {
        const res = await fetch(provider.endpoint, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${process.env[provider.apiKeyEnv]}`, 
            'Content-Type': 'application/json',
            'X-Title': 'EduNexus AI Synthesis'
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [{ role: 'system', content: options.systemPrompt || 'World-class pedagogical designer.' }, { role: 'user', content: prompt }],
            temperature: options.temperature || 0.1,
            max_tokens: provider.maxTokens
          })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(`${res.status}: ${err.error?.message || 'Node Error'}`);
        }
        const data = await res.json();
        content = data.choices[0].message.content;
      }

      const tracker = this.rateLimits.get(provider.id)!;
      tracker.requestCount++;
      tracker.lastRequest = Date.now();
      this.failedProviders.delete(provider.id);

      return { text: content, provider: provider.name };
    } catch (e: any) {
      console.error(`🔴 [Grid Failover] ${provider.name} rejected payload: ${e.message}`);
      this.failedProviders.add(provider.id);
      setTimeout(() => this.failedProviders.delete(provider.id), 120000);
      return this.synthesize(prompt, options);
    }
  }

  public getProviderStatus() {
    return Array.from(this.providers.values()).map(p => {
      const tracker = this.rateLimits.get(p.id)!;
      return {
        id: p.id,
        name: p.name,
        status: !p.enabled ? 'disabled' : this.failedProviders.has(p.id) ? 'failed' : tracker.requestCount >= p.rateLimit ? 'rate-limited' : 'active',
        remaining: Math.max(0, p.rateLimit - tracker.requestCount),
        tier: p.tier
      };
    });
  }

  // Add comment above each fix
  // Fix: Expose internal provider storage for status monitoring and configuration mapping
  public getProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }
}

let instance: SynthesizerCore | null = null;
export function getSynthesizer(): SynthesizerCore {
  if (!instance) instance = new SynthesizerCore();
  return instance;
}

// Add comment above each fix
// Fix: Export getProvidersConfig function to provide standard provider configurations to the multi-provider orchestrator
export function getProvidersConfig(): any[] {
  return getSynthesizer().getProviders().map(p => ({
    ...p,
    rpm: p.rateLimit,
    rpd: p.rateLimit * 1440 // Estimated daily limit based on RPM (60 mins * 24 hours)
  }));
}

// For backward compatibility with existing multi-provider-router calls
export const synthesize = (prompt: string, history: any[], hasDocs: boolean, docParts?: any[], preferred?: string, system?: string, bypass?: boolean) => {
  return getSynthesizer().synthesize(prompt, { type: hasDocs ? 'map' : 'chat', systemPrompt: system });
};
