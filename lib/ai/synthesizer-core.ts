import { GoogleGenAI } from "@google/genai";
import { isGeminiEnabled } from '../env-server';

export interface AIProvider {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  apiKeyEnv: string;
  maxTokens: number;
  rateLimit: number; 
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
  private failedProviders: Map<string, number>; // ID -> Expiry

  constructor() {
    this.providers = this.initializeProviders();
    this.rateLimits = new Map();
    this.failedProviders = new Map();
    
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

    providers.set('gemini-flash', {
      id: 'gemini-flash',
      name: 'Gemini 3 Flash',
      endpoint: 'native',
      model: 'gemini-3-flash-preview',
      apiKeyEnv: 'API_KEY',
      maxTokens: 8192,
      rateLimit: 60,
      tier: 1,
      enabled: isGeminiEnabled()
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

    providers.set('deepseek', {
      id: 'deepseek',
      name: 'DeepSeek R1',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      maxTokens: 8192,
      rateLimit: 20,
      tier: 1,
      enabled: !!process.env.DEEPSEEK_API_KEY
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
    const now = Date.now();
    
    // Clear expired failures
    for (const [id, expiry] of this.failedProviders.entries()) {
      if (now > expiry) this.failedProviders.delete(id);
    }

    const candidates = Array.from(this.providers.values())
      .filter(p => p.enabled && !this.failedProviders.has(p.id))
      .sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        const aT = this.rateLimits.get(a.id)!;
        const bT = this.rateLimits.get(b.id)!;
        return aT.requestCount - bT.requestCount;
      });

    // EMERGENCY RESET: If all nodes are blacklisted, revive one
    if (candidates.length === 0 && Array.from(this.providers.values()).some(p => p.enabled)) {
      console.warn("⚠️ GRID_BLACKOUT: Reviving Gemini Flash for emergency recovery.");
      const gemini = this.providers.get('gemini-flash');
      if (gemini?.enabled) {
        this.failedProviders.delete('gemini-flash');
        return gemini;
      }
    }

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
      return true;
    }
    return false;
  }

  public async synthesize(prompt: string, options: any = {}): Promise<any> {
    const type = options.type || 'chat';
    const provider = await this.selectProvider(type);
    if (!provider) throw new Error('GRID_EXHAUSTED: All neural nodes are cooling down.');

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
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [{ role: 'system', content: options.systemPrompt || 'World-class pedagogical formatter.' }, { role: 'user', content: prompt }],
            temperature: options.temperature || 0.0,
            max_tokens: provider.maxTokens
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Node ${provider.name} error: ${res.status}`);
        }
        const data = await res.json();
        content = data.choices[0].message.content;
      }

      const tracker = this.rateLimits.get(provider.id)!;
      tracker.requestCount++;
      tracker.lastRequest = Date.now();
      
      return { text: content, provider: provider.name };
    } catch (e: any) {
      console.error(`🔴 [Failover] Node ${provider.id}: ${e.message}`);
      this.failedProviders.set(provider.id, Date.now() + 90000); // 90s blacklist
      return this.synthesize(prompt, options);
    }
  }

  public getProviderStatus() {
    return Array.from(this.providers.values()).map(p => {
      const tracker = this.rateLimits.get(p.id)!;
      const isFailed = this.failedProviders.has(p.id);
      return {
        id: p.id,
        name: p.name,
        status: !p.enabled ? 'disabled' : isFailed ? 'failed' : tracker.requestCount >= p.rateLimit ? 'rate-limited' : 'active',
        remaining: Math.max(0, p.rateLimit - tracker.requestCount),
        tier: p.tier
      };
    });
  }
}

let instance: SynthesizerCore | null = null;
export function getSynthesizer(): SynthesizerCore {
  if (!instance) instance = new SynthesizerCore();
  return instance;
}

export function getProvidersConfig(): any[] {
  return getSynthesizer().getProviderStatus().map(p => ({
    name: p.id,
    rpm: 30,
    rpd: 1000,
    enabled: p.status !== 'disabled'
  }));
}

export const synthesize = (prompt: string, history: any[], hasDocs: boolean, docParts?: any[], preferred?: string, system?: string) => {
  return getSynthesizer().synthesize(prompt, { type: hasDocs ? 'map' : 'chat', systemPrompt: system });
};