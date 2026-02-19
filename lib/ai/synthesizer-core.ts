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
  tier: 1 | 2 | 3; // 1: Reasoning/Complex, 2: High-Speed, 3: Fallback
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

    // TIER 1: THE REASONERS (Curriculum Ingestion, Deep Strategy)
    providers.set('gemini-pro', {
      id: 'gemini-pro',
      name: 'Gemini 3 Pro',
      endpoint: 'native',
      model: 'gemini-3-pro-preview',
      apiKeyEnv: 'API_KEY',
      maxTokens: 16384,
      thinkingBudget: 4096, 
      rpm: 10,
      rpd: 2000,
      tier: 1,
      enabled: isGeminiEnabled()
    });

    providers.set('deepseek-r1', {
      id: 'deepseek-r1',
      name: 'DeepSeek R1',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-reasoner',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      maxTokens: 16384,
      rpm: 10,
      rpd: 1000,
      tier: 1,
      enabled: !!process.env.DEEPSEEK_API_KEY
    });

    providers.set('grok-reasoner', {
      id: 'grok-reasoner',
      name: 'Grok 2',
      endpoint: 'https://api.x.ai/v1/chat/completions',
      model: 'grok-2-1212',
      apiKeyEnv: 'GROK_API_KEY',
      maxTokens: 32768,
      rpm: 20,
      rpd: 5000,
      tier: 1,
      enabled: !!process.env.GROK_API_KEY
    });

    // TIER 2: THE ENGINES (Chat, MCQs, Rapid Refinement)
    providers.set('gemini-flash', {
      id: 'gemini-flash',
      name: 'Gemini 3 Flash',
      endpoint: 'native',
      model: 'gemini-3-flash-preview',
      apiKeyEnv: 'API_KEY',
      maxTokens: 8192,
      rpm: 30,
      rpd: 10000,
      tier: 2,
      enabled: isGeminiEnabled()
    });

    providers.set('groq-llama', {
      id: 'groq-llama',
      name: 'Groq Llama 3.3',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile',
      apiKeyEnv: 'GROQ_API_KEY',
      maxTokens: 4096,
      rpm: 60,
      rpd: 15000,
      tier: 2,
      enabled: !!process.env.GROQ_API_KEY
    });

    return providers;
  }

  public async synthesize(prompt: string, options: any = {}): Promise<any> {
    const now = Date.now();
    
    // Purge expired failures
    for (const [id, expiry] of this.failedProviders.entries()) {
      if (now > expiry) this.failedProviders.delete(id);
    }

    const history = options.history || [];
    const systemPrompt = options.systemPrompt || "You are a world-class pedagogy master.";
    const taskComplexity = options.complexity || 2; 

    // Filter available candidates
    let candidates = Array.from(this.providers.values())
      .filter(p => p.enabled && !this.failedProviders.has(p.id));

    // Sort by tier alignment (Complexity 3 wants Tier 1, etc.)
    candidates.sort((a, b) => {
      const distA = Math.abs(a.tier - (taskComplexity >= 3 ? 1 : 2));
      const distB = Math.abs(b.tier - (taskComplexity >= 3 ? 1 : 2));
      return distA - distB;
    });

    if (candidates.length === 0) {
      console.warn("⚠️ GRID DEPLETION: All nodes failed or disabled. Attempting emergency reset.");
      this.failedProviders.clear();
      candidates = Array.from(this.providers.values()).filter(p => p.enabled);
    }

    for (const provider of candidates) {
      try {
        const apiKey = process.env[provider.apiKeyEnv];
        if (!apiKey) continue;

        let content = "";
        
        if (provider.endpoint === 'native') {
          const ai = new GoogleGenAI({ apiKey });
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
              systemInstruction: systemPrompt,
              maxOutputTokens: provider.maxTokens,
              temperature: 0.1,
              thinkingConfig: provider.thinkingBudget ? { thinkingBudget: provider.thinkingBudget } : undefined
            }
          });
          content = res.text || "";
        } else {
          // OPENAI COMPATIBLE FETCH (DeepSeek, Groq, Grok)
          const res = await fetch(provider.endpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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

          if (res.status === 429) throw new Error("RATELIMIT_EXCEEDED");
          if (!res.ok) throw new Error(`NODE_ERROR_${res.status}`);
          
          const data = await res.json();
          content = data.choices[0].message.content;
        }

        if (content) return { text: content, provider: provider.name };
      } catch (e: any) {
        // Blacklist node for 5 minutes if quota reached, 1 minute for others
        const cooldown = e.message.includes('429') || e.message.includes('RATELIMIT') ? 300000 : 60000;
        this.failedProviders.set(provider.id, Date.now() + cooldown);
        console.error(`🔴 Node Failure [${provider.name}]:`, e.message);
      }
    }

    throw new Error("AI Alert: Global Synthesis Failure. All engines on the grid are currently unreachable or saturated.");
  }

  public realignGrid() {
    this.failedProviders.clear();
  }

  public getProviderStatus() {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name,
      status: !p.enabled ? 'disabled' : this.failedProviders.has(p.id) ? 'saturated' : 'active',
      tier: p.tier
    }));
  }
}

let instance: SynthesizerCore | null = null;
export function getSynthesizer(): SynthesizerCore {
  if (!instance) instance = new SynthesizerCore();
  return instance;
}

export const synthesize = (prompt: string, options: any = {}) => {
  return getSynthesizer().synthesize(prompt, options);
};
