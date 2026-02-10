
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
  lastError?: string;
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

    providers.set('gemini-pro', {
      id: 'gemini-pro',
      name: 'Gemini 3 Pro',
      endpoint: 'native',
      model: 'gemini-3-pro-preview',
      apiKeyEnv: 'API_KEY',
      maxTokens: 8192,
      thinkingBudget: 2048, 
      rpm: 10,
      rpd: 2000,
      tier: 1,
      enabled: isGeminiEnabled()
    });

    providers.set('gemini-flash', {
      id: 'gemini-flash',
      name: 'Gemini 3 Flash',
      endpoint: 'native',
      model: 'gemini-3-flash-preview',
      apiKeyEnv: 'API_KEY',
      maxTokens: 4096,
      thinkingBudget: 512, 
      rpm: 15,
      rpd: 5000,
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
      rpm: 30,
      rpd: 10000,
      tier: 2,
      enabled: !!process.env.GROQ_API_KEY
    });

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

    return providers;
  }

  public realignGrid() {
    this.failedProviders.clear();
    return true;
  }

  public async synthesize(prompt: string, options: any = {}): Promise<any> {
    const now = Date.now();
    for (const [id, expiry] of this.failedProviders.entries()) {
      if (now > expiry) this.failedProviders.delete(id);
    }

    const history = options.history || [];
    const systemPrompt = options.systemPrompt || "You are a world-class pedagogy master.";
    
    const isSurgicalExtract = prompt.includes('SURGICAL_PRECISION_VAULT_EXTRACT');
    const isConversion = prompt.includes('Linearize Curriculum Grids');

    let candidates = Array.from(this.providers.values())
      .filter(p => p.enabled && !this.failedProviders.has(p.id));

    if (candidates.length === 0) {
      this.failedProviders.clear();
      candidates = Array.from(this.providers.values()).filter(p => p.enabled);
    }

    if (candidates.length === 0) {
      throw new Error("AI Alert: Synthesis grid exception.");
    }

    candidates.sort((a, b) => a.tier - b.tier);

    for (const provider of candidates) {
      try {
        let content = "";
        const apiKey = process.env[provider.apiKeyEnv];
        if (!apiKey) continue;

        if (provider.endpoint === 'native') {
          const ai = new GoogleGenAI({ apiKey });
          // FORCED LOW TEMPERATURE (0.1) for maximum math and structural precision
          const config: any = { 
            temperature: 0.1, 
            maxOutputTokens: provider.maxTokens 
          };
          
          if (provider.thinkingBudget !== undefined) {
            let budget = provider.thinkingBudget;
            if (isConversion) budget = Math.min(budget * 2, 8192);
            if (isSurgicalExtract) budget = 0; 
            config.thinkingConfig = { thinkingBudget: budget };
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
            config: { ...config, systemInstruction: systemPrompt }
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
                ...history.map((h: any) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
                { role: 'user', content: prompt }
              ],
              temperature: 0.1,
              max_tokens: provider.maxTokens
            })
          });

          if (!res.ok) throw new Error(`Node Refusal: ${res.status}`);
          const data = await res.json();
          content = data.choices[0].message.content;
        }

        if (content && content.trim().length > 0) {
          return { text: content, provider: provider.name };
        }
      } catch (e: any) {
        this.failedProviders.set(provider.id, Date.now() + 5000); 
        console.warn(`[Synthesizer] Failover from ${provider.name}:`, e.message);
      }
    }

    throw new Error(`AI Alert: Synthesis grid saturated.`);
  }

  public getProviderStatus() {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name,
      status: !p.enabled ? 'disabled' : this.failedProviders.has(p.id) ? 'failed' : 'active',
      tier: p.tier,
      lastError: p.lastError
    }));
  }
}

let instance: SynthesizerCore | null = null;
export function getSynthesizer(): SynthesizerCore {
  if (!instance) instance = new SynthesizerCore();
  return instance;
}

export const synthesize = (prompt: string, history: any[], hasDocs: boolean, docParts?: any[], preferred?: string, system?: string) => {
  return getSynthesizer().synthesize(prompt, { history, systemPrompt: system, hasDocs });
};
