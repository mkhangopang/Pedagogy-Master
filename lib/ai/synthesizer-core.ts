import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { resolveApiKey } from '../env-server';

export interface AIProvider {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  apiKeyEnv: string;
  maxTokens: number;
  thinkingLevel?: ThinkingLevel;
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

    // TIER 1: THE REASONERS
    providers.set('gemini-pro', {
      id: 'gemini-pro',
      name: 'Gemini 3.1 Pro',
      endpoint: 'native',
      model: 'gemini-3.1-pro-preview',
      apiKeyEnv: 'API_KEY', // User has API_KEY for Gemini
      maxTokens: 16384,
      thinkingLevel: ThinkingLevel.HIGH, 
      rpm: 10,
      rpd: 2000,
      tier: 1,
      enabled: true
    });

    providers.set('sambanova', {
      id: 'sambanova',
      name: 'SambaNova (Llama 3.1 405B)',
      endpoint: 'https://api.sambanova.ai/v1/chat/completions',
      model: 'Meta-Llama-3.1-405B-Instruct',
      apiKeyEnv: 'SAMBANOVA_API_KEY',
      maxTokens: 8192,
      rpm: 100,
      rpd: 10000,
      tier: 1,
      enabled: true
    });

    providers.set('grok-2', {
      id: 'grok-2',
      name: 'Grok 2 (xAI)',
      endpoint: 'https://api.x.ai/v1/chat/completions',
      model: 'grok-2-1212',
      apiKeyEnv: 'GROK_API_KEY',
      maxTokens: 32768,
      rpm: 20,
      rpd: 5000,
      tier: 1,
      enabled: !!(process.env.GROK_API_KEY || process.env.AI_GATEWAY_API_KEY)
    });

    // TIER 2: THE ENGINES (Flash Fallback)
    providers.set('cerebras', {
      id: 'cerebras',
      name: 'Cerebras (Llama 3.1 70B)',
      endpoint: 'https://api.cerebras.ai/v1/chat/completions',
      model: 'llama3.1-70b',
      apiKeyEnv: 'CEREBRAS_API_KEY',
      maxTokens: 8192,
      rpm: 100,
      rpd: 10000,
      tier: 2,
      enabled: true
    });

    providers.set('gemini-flash', {
      id: 'gemini-flash',
      name: 'Gemini 3 Flash',
      endpoint: 'native',
      model: 'gemini-3-flash-preview',
      apiKeyEnv: 'API_KEY',
      maxTokens: 8192,
      rpm: 100,
      rpd: 10000,
      tier: 2,
      enabled: true
    });

    providers.set('mistral-large', {
      id: 'mistral-large',
      name: 'Mistral Large',
      endpoint: 'https://api.mistral.ai/v1/chat/completions',
      model: 'mistral-large-latest',
      apiKeyEnv: 'API_MISTRAL', // User has API_MISTRAL
      maxTokens: 32768,
      rpm: 20,
      rpd: 5000,
      tier: 2,
      enabled: true
    });

    providers.set('deepseek-v3', {
      id: 'deepseek-v3',
      name: 'DeepSeek V3',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      maxTokens: 8192,
      rpm: 100,
      rpd: 10000,
      tier: 2,
      enabled: true
    });

    providers.set('openrouter', {
      id: 'openrouter',
      name: 'OpenRouter (Auto-Fallback)',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'openrouter/auto',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      maxTokens: 8192,
      rpm: 100,
      rpd: 10000,
      tier: 3,
      enabled: true
    });

    return providers;
  }

  /**
   * RECOVERY PROTOCOL: Clears all blacklisted nodes.
   */
  public realignGrid() {
    this.failedProviders.clear();
    console.log("⚡ [Grid] All nodes re-initialized for synthesis.");
  }

  public async synthesize(prompt: string, options: any = {}): Promise<any> {
    const now = Date.now();
    const history = options.history || [];
    const systemPrompt = options.systemPrompt || "You are a world-class pedagogy master.";
    const complexity = options.complexity || 2; 

    // filter and sort candidates by tier
    let candidates = Array.from(this.providers.values())
      .filter(p => p.enabled && (!this.failedProviders.has(p.id) || now > (this.failedProviders.get(p.id) || 0)));

    candidates.sort((a, b) => {
      const targetTier = complexity >= 3 ? 1 : 2;
      return Math.abs(a.tier - targetTier) - Math.abs(b.tier - targetTier);
    });

    if (candidates.length === 0) {
      this.realignGrid();
      candidates = Array.from(this.providers.values()).filter(p => p.enabled);
    }

    for (const provider of candidates) {
      try {
        let apiKey = (provider.apiKeyEnv === 'NEXT_PUBLIC_GEMINI_API_KEY' || provider.apiKeyEnv === 'API_KEY')
          ? (process.env.API_KEY || resolveApiKey()) 
          : process.env[provider.apiKeyEnv];
          
        if (!apiKey && provider.id === 'grok-2') {
          apiKey = process.env.AI_GATEWAY_API_KEY;
        }

        if (!apiKey) continue;

        if (provider.endpoint === 'native') {
          const ai = new GoogleGenAI({ apiKey });
          const res = await ai.models.generateContent({
            model: provider.model,
            contents: [
              ...history.map((h: any) => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
              { role: 'user', parts: [{ text: prompt }] }
            ],
            config: { 
              systemInstruction: systemPrompt,
              temperature: 0.1,
              thinkingConfig: provider.thinkingLevel ? { thinkingLevel: provider.thinkingLevel } : undefined
            }
          });
          return { text: res.text, provider: provider.name };
        } else {
          // REST Fallback (OpenAI compatible)
          const res = await fetch(provider.endpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: provider.model,
              messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
              temperature: 0.1
            })
          });
          if (!res.ok) throw new Error(`Node_Error_${res.status}`);
          const data = await res.json();
          return { text: data.choices[0].message.content, provider: provider.name };
        }
      } catch (e: any) {
        // Blacklist node for 10 mins if it's a 429
        const msg = e?.message || "Unknown error";
        const cooldown = msg.includes('429') ? 600000 : 60000;
        this.failedProviders.set(provider.id, Date.now() + cooldown);
        console.warn(`🔴 [Grid] Node ${provider.name} saturated. Failover initiated. Error: ${msg}`);
      }
    }
    throw new Error("AI Alert: Global Synthesis Failure. All engines saturated.");
  }

  public getProviderStatus() {
    const now = Date.now();
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name,
      status: !p.enabled ? 'disabled' : (this.failedProviders.has(p.id) && now < (this.failedProviders.get(p.id) || 0)) ? 'saturated' : 'active',
      tier: p.tier
    }));
  }
}

let instance: SynthesizerCore | null = null;
export function getSynthesizer(): SynthesizerCore {
  if (!instance) instance = new SynthesizerCore();
  return instance;
}

export const synthesize = (prompt: string, options: any = {}) => getSynthesizer().synthesize(prompt, options);
