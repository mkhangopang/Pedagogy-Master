
import { GoogleGenAI } from "@google/genai";
import { isGeminiEnabled } from '../env-server';

export interface AIProvider {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  apiKeyEnv: string;
  maxTokens: number;
  thinkingBudget?: number;
  rateLimit: number; 
  rpm: number;
  rpd: number;
  tier: 1 | 2 | 3;
  enabled: boolean;
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

    // NODE 1: PREMIER REASONING (Gemini 3 Pro)
    providers.set('gemini-pro', {
      id: 'gemini-pro',
      name: 'Gemini 3 Pro',
      endpoint: 'native',
      model: 'gemini-3-pro-preview',
      apiKeyEnv: 'API_KEY',
      maxTokens: 8192,
      thinkingBudget: 4096,
      rateLimit: 50,
      rpm: 2,
      rpd: 1000,
      tier: 1,
      enabled: isGeminiEnabled()
    });

    // NODE 2: HIGH-SPEED VERSATILITY (Gemini 3 Flash)
    providers.set('gemini-flash', {
      id: 'gemini-flash',
      name: 'Gemini 3 Flash',
      endpoint: 'native',
      model: 'gemini-3-flash-preview',
      apiKeyEnv: 'API_KEY',
      maxTokens: 4096,
      thinkingBudget: 1024,
      rateLimit: 100,
      rpm: 15,
      rpd: 2000,
      tier: 1,
      enabled: isGeminiEnabled()
    });

    // NODE 3: INSTANT INFERENCE (Groq)
    providers.set('groq', {
      id: 'groq',
      name: 'Groq Llama 3.3',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile',
      apiKeyEnv: 'GROQ_API_KEY',
      maxTokens: 4096,
      rateLimit: 30,
      rpm: 30,
      rpd: 5000,
      tier: 2,
      enabled: !!process.env.GROQ_API_KEY
    });

    // NODE 4: FASTEST GRID SEGMENT (Cerebras)
    providers.set('cerebras', {
      id: 'cerebras',
      name: 'Cerebras Node',
      endpoint: 'https://api.cerebras.ai/v1/chat/completions',
      model: 'llama3.1-70b',
      apiKeyEnv: 'CEREBRAS_API_KEY',
      maxTokens: 2048,
      rateLimit: 60,
      rpm: 60,
      rpd: 10000,
      tier: 2,
      enabled: !!process.env.CEREBRAS_API_KEY
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
      .sort((a, b) => {
        const isPulse = prompt.includes('FAST_PULSE_EXTRACTOR');
        if (isPulse) return b.tier - a.tier;
        return a.tier - b.tier;
      });

    if (candidates.length === 0) {
      throw new Error("NEURAL_GRID_OFFLINE: All nodes are cooling down.");
    }

    for (const provider of candidates) {
      try {
        let content = "";
        if (provider.endpoint === 'native') {
          const ai = new GoogleGenAI({ apiKey: process.env[provider.apiKeyEnv]! });
          
          // FIX: Deterministic temperature for pedagogical accuracy (Audit Requirement)
          const config: any = { 
            temperature: options.temperature ?? 0.0, 
            maxOutputTokens: provider.maxTokens 
          };
          if (provider.thinkingBudget !== undefined) {
            config.thinkingConfig = { thinkingBudget: provider.thinkingBudget };
          }

          const res = await ai.models.generateContent({
            model: provider.model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config
          });
          
          // FIX: Correct property access (.text not .text())
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
              messages: [{ role: 'system', content: options.systemPrompt || 'Output Markdown.' }, { role: 'user', content: prompt }],
              temperature: options.temperature ?? 0.0,
              max_tokens: provider.maxTokens
            })
          });
          if (!res.ok) throw new Error(`Node ${provider.id} Refusal: ${res.status}`);
          const data = await res.json();
          content = data.choices[0].message.content;
        }

        if (content) return { text: content, provider: provider.name };
      } catch (e: any) {
        console.warn(`[Synthesizer] Node ${provider.id} fault: ${e.message}. Switching segment...`);
        this.failedProviders.set(provider.id, Date.now() + 30000); 
      }
    }

    throw new Error("GRID_FAILURE: All synthesis segments exhausted.");
  }

  public getProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  public getProviderStatus() {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name,
      status: !p.enabled ? 'disabled' : this.failedProviders.has(p.id) ? 'failed' : 'active',
      tier: p.tier,
      remaining: 'N/A'
    }));
  }
}

let instance: SynthesizerCore | null = null;
export function getSynthesizer(): SynthesizerCore {
  if (!instance) instance = new SynthesizerCore();
  return instance;
}

export function getProvidersConfig(): AIProvider[] {
  return getSynthesizer().getProviders();
}

export const synthesize = (prompt: string, history: any[], hasDocs: boolean, docParts?: any[], preferred?: string, system?: string) => {
  return getSynthesizer().synthesize(prompt, { type: 'chat', systemPrompt: system });
};
