
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
  // Fix: Added rpm and rpd for compatibility with ProviderConfig used in rate-limiter.ts
  rpm: number;
  rpd: number;
  tier: 1 | 2;
  enabled: boolean;
  canHandleLargeContext: boolean;
}

export class SynthesizerCore {
  private providers: Map<string, AIProvider>;
  private failedProviders: Map<string, number>;

  constructor() {
    this.providers = this.initializeProviders();
    this.failedProviders = new Map();
  }

  private initializeProviders(): Map<string, AIProvider> {
    const providers = new Map<string, AIProvider>();

    providers.set('gemini-flash', {
      id: 'gemini-flash',
      name: 'Gemini 3 Flash',
      endpoint: 'native',
      model: 'gemini-3-flash-preview',
      apiKeyEnv: 'API_KEY',
      maxTokens: 2048, // Reduced for speed in Pulse Mode
      rateLimit: 60,
      // Fix: Provided rpm and rpd values
      rpm: 60,
      rpd: 10000,
      tier: 1,
      enabled: isGeminiEnabled(),
      canHandleLargeContext: true
    });

    providers.set('groq', {
      id: 'groq',
      name: 'Groq Llama 3.3',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile',
      apiKeyEnv: 'GROQ_API_KEY',
      maxTokens: 1024,
      rateLimit: 30,
      // Fix: Provided rpm and rpd values
      rpm: 30,
      rpd: 5000,
      tier: 1,
      enabled: !!process.env.GROQ_API_KEY,
      canHandleLargeContext: false
    });

    return providers;
  }

  public async synthesize(prompt: string, options: any = {}): Promise<any> {
    const now = Date.now();
    for (const [id, expiry] of this.failedProviders.entries()) {
      if (now > expiry) this.failedProviders.delete(id);
    }

    const candidates = Array.from(this.providers.values())
      .filter(p => p.enabled && !this.failedProviders.has(p.id))
      .sort((a, b) => a.tier - b.tier);

    if (candidates.length === 0) {
      throw new Error("GRID_EXHAUSTED: Neural nodes cooling down. Retry Pulse in 10s.");
    }

    for (const provider of candidates) {
      try {
        let content = "";
        if (provider.endpoint === 'native') {
          // Fix: Initializing GoogleGenAI with named parameter apiKey as per guidelines
          const ai = new GoogleGenAI({ apiKey: process.env[provider.apiKeyEnv]! });
          const res = await ai.models.generateContent({
            model: provider.model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { 
              temperature: 0.0, 
              maxOutputTokens: provider.maxTokens,
              thinkingConfig: { thinkingBudget: 0 }
            }
          });
          // Fix: Accessing generated text via .text property on GenerateContentResponse
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
              messages: [{ role: 'system', content: 'Output ONLY structured markdown.' }, { role: 'user', content: prompt }],
              temperature: 0.0,
              max_tokens: provider.maxTokens
            })
          });
          if (!res.ok) throw new Error("Node Rejected Pulse");
          const data = await res.json();
          content = data.choices[0].message.content;
        }

        if (content) return { text: content, provider: provider.name };
      } catch (e: any) {
        this.failedProviders.set(provider.id, Date.now() + 30000); // 30s block
      }
    }

    throw new Error("PULSE_FAULT: Neural nodes timed out. Retrying segment...");
  }

  // Fix: Added public method to access providers
  public getProviders(): AIProvider[] {
    return Array.from(this.providers.values());
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

// Fix: Exporting getProvidersConfig function required by multi-provider-router.ts
export function getProvidersConfig(): AIProvider[] {
  return getSynthesizer().getProviders();
}

export const synthesize = (prompt: string, history: any[], hasDocs: boolean, docParts?: any[], preferred?: string, system?: string) => {
  return getSynthesizer().synthesize(prompt, { type: 'chat', systemPrompt: system });
};
