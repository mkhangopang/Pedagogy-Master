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
      rpm: 5,
      rpd: 2000,
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
      rpm: 15,
      rpd: 5000,
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
      rpm: 30,
      rpd: 10000,
      tier: 2,
      enabled: !!process.env.GROQ_API_KEY
    });

    // NODE 4: FASTEST GRID SEGMENT (Cerebras)
    providers.set('cerebras', {
      id: 'cerebras',
      name: 'Cerebras Llama',
      endpoint: 'https://api.cerebras.ai/v1/chat/completions',
      model: 'llama3.1-70b',
      apiKeyEnv: 'CEREBRAS_API_KEY',
      maxTokens: 2048,
      rpm: 60,
      rpd: 20000,
      tier: 2,
      enabled: !!process.env.CEREBRAS_API_KEY
    });

    // NODE 5: DEEP REASONING FALLBACK (DeepSeek)
    providers.set('deepseek', {
      id: 'deepseek',
      name: 'DeepSeek Node',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      maxTokens: 4096,
      rpm: 10,
      rpd: 3000,
      tier: 2,
      enabled: !!process.env.DEEPSEEK_API_KEY
    });

    // NODE 6: TOKEN THROUGHPUT (SambaNova)
    providers.set('sambanova', {
      id: 'sambanova',
      name: 'SambaNova Hub',
      endpoint: 'https://api.sambanova.ai/v1/chat/completions',
      model: 'Meta-Llama-3.1-70B-Instruct',
      apiKeyEnv: 'SAMBANOVA_API_KEY',
      maxTokens: 8192,
      rpm: 20,
      rpd: 5000,
      tier: 3,
      enabled: !!process.env.SAMBANOVA_API_KEY
    });

    // NODE 7: DECENTRALIZED FALLBACK (Hyperbolic)
    providers.set('hyperbolic', {
      id: 'hyperbolic',
      name: 'Hyperbolic Node',
      endpoint: 'https://api.hyperbolic.xyz/v1/chat/completions',
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      apiKeyEnv: 'HYPERBOLIC_API_KEY',
      maxTokens: 4096,
      rpm: 10,
      rpd: 2000,
      tier: 3,
      enabled: !!process.env.HYPERBOLIC_API_KEY
    });

    return providers;
  }

  public async synthesize(prompt: string, options: any = {}): Promise<any> {
    const now = Date.now();
    for (const [id, expiry] of this.failedProviders.entries()) {
      if (now > expiry) this.failedProviders.delete(id);
    }

    const history = options.history || [];
    const systemPrompt = options.systemPrompt || "You are a world-class pedagogy master.";
    const isMassiveTask = prompt.length > 8000 || prompt.includes('MASTER MD') || prompt.includes('LINEARIZATION');

    const candidates = Array.from(this.providers.values())
      .filter(p => p.enabled && !this.failedProviders.has(p.id))
      .sort((a, b) => {
        if (isMassiveTask) return a.tier - b.tier;
        return b.tier - a.tier;
      });

    if (candidates.length === 0) {
      throw new Error("NEURAL_GRID_SATURATED: All 7 segments are in temporary cooldown. Please wait 15 seconds.");
    }

    const errors: string[] = [];

    for (const provider of candidates) {
      try {
        let content = "";
        const apiKey = process.env[provider.apiKeyEnv];
        if (!apiKey) continue;

        if (provider.endpoint === 'native') {
          const ai = new GoogleGenAI({ apiKey });
          const config: any = { 
            temperature: options.temperature ?? 0.1, 
            maxOutputTokens: provider.maxTokens 
          };
          if (provider.thinkingBudget !== undefined) {
            config.thinkingConfig = { thinkingBudget: provider.thinkingBudget };
          }

          const contents = [
            ...history.map((h: any) => ({ 
              role: h.role === 'user' ? 'user' : 'model', 
              parts: [{ text: h.content }] 
            })),
            { role: 'user', parts: [{ text: prompt }] }
          ];

          const res = await ai.models.generateContent({
            model: provider.model,
            contents,
            config: {
              ...config,
              systemInstruction: systemPrompt
            }
          });
          
          content = res.text || "";
        } else {
          const res = await fetch(provider.endpoint, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${apiKey}`, 
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: provider.model,
              messages: [
                { role: 'system', content: systemPrompt },
                ...history.map((h: any) => ({ 
                  role: h.role === 'user' ? 'user' : 'assistant', 
                  content: h.content 
                })),
                { role: 'user', content: prompt }
              ],
              temperature: options.temperature ?? 0.1,
              max_tokens: provider.maxTokens
            })
          });

          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Node ${provider.id} Refusal: ${res.status} - ${errorText.substring(0, 100)}`);
          }
          const data = await res.json();
          content = data.choices[0].message.content;
        }

        if (content && content.trim().length > 0) {
          return { text: content, provider: provider.name };
        }
      } catch (e: any) {
        console.warn(`⚠️ [Synthesizer] Failover from ${provider.name}: ${e.message}`);
        errors.push(`${provider.name}: ${e.message}`);
        this.failedProviders.set(provider.id, Date.now() + 60000); 
      }
    }

    throw new Error(`GRID_FAULT: All providers failed. Logs: ${errors.join(' | ')}`);
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

export const synthesize = (
  prompt: string, 
  history: any[], 
  hasDocs: boolean, 
  docParts?: any[], 
  preferred?: string, 
  system?: string
) => {
  return getSynthesizer().synthesize(prompt, { 
    history, 
    systemPrompt: system,
    hasDocs
  });
};