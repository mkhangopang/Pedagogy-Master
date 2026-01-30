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
  canHandleLargeContext: boolean;
}

interface RateLimitTracker {
  requestCount: number;
  windowStart: number;
  lastRequest: number;
}

export class SynthesizerCore {
  private providers: Map<string, AIProvider>;
  private rateLimits: Map<string, RateLimitTracker>;
  private failedProviders: Map<string, number>;

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
      enabled: isGeminiEnabled(),
      canHandleLargeContext: true
    });

    providers.set('openrouter', {
      id: 'openrouter',
      name: 'OpenRouter Hub',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'google/gemini-2.0-flash-001',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      maxTokens: 8192,
      rateLimit: 20,
      tier: 1,
      enabled: !!process.env.OPENROUTER_API_KEY,
      canHandleLargeContext: true
    });

    providers.set('groq', {
      id: 'groq',
      name: 'Groq Llama',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile',
      apiKeyEnv: 'GROQ_API_KEY',
      maxTokens: 4096,
      rateLimit: 30,
      tier: 1,
      enabled: !!process.env.GROQ_API_KEY,
      canHandleLargeContext: false
    });

    providers.set('cerebras', {
      id: 'cerebras',
      name: 'Cerebras Ultra',
      endpoint: 'https://api.cerebras.ai/v1/chat/completions',
      model: 'llama3.1-70b', 
      apiKeyEnv: 'CEREBRAS_API_KEY',
      maxTokens: 2048,
      rateLimit: 15,
      tier: 2,
      enabled: !!process.env.CEREBRAS_API_KEY,
      canHandleLargeContext: false
    });

    return providers;
  }

  public async synthesize(prompt: string, options: any = {}): Promise<any> {
    const isHeavy = options.type === 'reduce' || prompt.length > 8000;
    const now = Date.now();
    
    // Cleanup failures
    for (const [id, expiry] of this.failedProviders.entries()) {
      if (now > expiry) this.failedProviders.delete(id);
    }

    // Get viable nodes for this specific task
    const candidates = Array.from(this.providers.values())
      .filter(p => p.enabled && !this.failedProviders.has(p.id))
      .filter(p => isHeavy ? p.canHandleLargeContext : true)
      .sort((a, b) => a.tier - b.tier);

    if (candidates.length === 0) {
      throw new Error("GRID_EXHAUSTED: All high-context nodes are currently in a cooldown state. Please retry in 60s.");
    }

    // Linear Execution (No Recursion)
    for (const provider of candidates) {
      try {
        console.log(`🛰️ Engaging Node: ${provider.name}`);
        let content = "";

        if (provider.endpoint === 'native') {
          const ai = new GoogleGenAI({ apiKey: process.env[provider.apiKeyEnv]! });
          const res = await ai.models.generateContent({
            model: provider.model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { 
              temperature: 0.0, 
              maxOutputTokens: provider.maxTokens,
              thinkingConfig: { thinkingBudget: 0 } // Speed priority
            }
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
              messages: [{ role: 'system', content: options.systemPrompt || 'Formatting node.' }, { role: 'user', content: prompt }],
              temperature: 0.0,
              max_tokens: provider.maxTokens
            })
          });

          if (!res.ok) throw new Error(`Node rejected request [${res.status}]`);
          const data = await res.json();
          content = data.choices[0].message.content;
        }

        if (content) return { text: content, provider: provider.name };
      } catch (e: any) {
        console.error(`🔴 Node Failure [${provider.id}]: ${e.message}`);
        this.failedProviders.set(provider.id, Date.now() + 60000); // 60s blacklist
      }
    }

    throw new Error("GRID_FAILURE: All neural nodes failed to synthesize the payload. The document chunk may be too complex.");
  }

  public getProviderStatus() {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name,
      status: !p.enabled ? 'disabled' : this.failedProviders.has(p.id) ? 'failed' : 'active',
      tier: p.tier
    }));
  }
}

let instance: SynthesizerCore | null = null;
export function getSynthesizer(): SynthesizerCore {
  if (!instance) instance = new SynthesizerCore();
  return instance;
}

export function getProvidersConfig(): any[] {
  return getSynthesizer().getProviderStatus();
}

export const synthesize = (prompt: string, history: any[], hasDocs: boolean, docParts?: any[], preferred?: string, system?: string) => {
  return getSynthesizer().synthesize(prompt, { type: hasDocs ? 'reduce' : 'chat', systemPrompt: system });
};