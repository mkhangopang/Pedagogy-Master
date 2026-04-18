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
  private failedProviders: Map<string, { until: number; retries: number }>;

  constructor() {
    this.providers = this.initializeProviders();
    this.failedProviders = new Map();
  }

  private initializeProviders(): Map<string, AIProvider> {
    const providers = new Map<string, AIProvider>();

    // TIER 1: REASONERS
    providers.set('gemini-pro', {
      id: 'gemini-pro',
      name: 'Gemini 2.5 Pro',
      endpoint: 'native',
      model: 'gemini-2.5-pro-preview-05-06',
      apiKeyEnv: 'API_KEY',
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

    // TIER 2: ENGINES
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
      name: 'Gemini 2.0 Flash',
      endpoint: 'native',
      model: 'gemini-2.0-flash',
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
      apiKeyEnv: 'API_MISTRAL',
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

  public realignGrid() {
    this.failedProviders.clear();
    console.log("⚡ [Grid] All nodes re-initialized for synthesis.");
  }

  public async synthesize(prompt: string, options: any = {}): Promise<any> {
    const now = Date.now();
    const history = options.history || [];
    const systemPrompt = options.systemPrompt || "You are a world-class pedagogy master.";
    const complexity = options.complexity || 2;

    // Filter and sort candidates by tier
    let candidates = Array.from(this.providers.values())
      .filter(p => p.enabled && (!this.failedProviders.has(p.id) || now > (this.failedProviders.get(p.id)?.until || 0)));

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
          // Gemini native SDK
          const ai = new GoogleGenAI({ apiKey });
          const res = await ai.models.generateContent({
            model: provider.model,
            contents: [
              // FIX: Always pass conversation history to Gemini
              ...history.map((h: any) => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.content }]
              })),
              { role: 'user', parts: [{ text: prompt }] }
            ],
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.1,
              thinkingConfig: provider.thinkingLevel
                ? { thinkingLevel: provider.thinkingLevel }
                : undefined
            }
          });
          return { text: res.text, provider: provider.name };

        } else {
          // FIX: REST providers now properly receive conversation history.
          // Previously history was silently dropped, causing context loss on failover.
          const formattedHistory = history.map((h: any) => ({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.content
          }));

          const messages = [
            { role: 'system', content: systemPrompt },
            ...formattedHistory,
            { role: 'user', content: prompt }
          ];

          const requestBody: any = {
            model: provider.model,
            messages,
            temperature: 0.1,
            max_tokens: provider.maxTokens
          };

          const headers: Record<string, string> = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          };

          // OpenRouter requires extra headers
          if (provider.id === 'openrouter') {
            headers['HTTP-Referer'] = process.env.NEXT_PUBLIC_SITE_URL || 'https://pedagogy-master.vercel.app';
            headers['X-Title'] = 'Pedagogy Master AI';
          }

          const res = await fetch(provider.endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
          });

          if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            throw new Error(`Node_Error_${res.status}: ${errBody.slice(0, 200)}`);
          }

          const data = await res.json();
          const text = data?.choices?.[0]?.message?.content;
          if (!text) throw new Error('Empty response from provider');
          return { text, provider: provider.name };
        }

      } catch (e: any) {
        const msg = e?.message || "Unknown error";
        // 429 = rate limit → cool off for 10 min; other errors → 1 min
        const cooldown = msg.includes('429') ? 600000 : 60000;
        const currentFails = this.failedProviders.get(provider.id)?.retries || 0;
        this.failedProviders.set(provider.id, { until: Date.now() + cooldown, retries: currentFails + 1 });
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
      status: !p.enabled
        ? 'disabled'
        : (this.failedProviders.has(p.id) && now < (this.failedProviders.get(p.id)?.until || 0))
          ? 'saturated'
          : 'active',
      tier: p.tier
    }));
  }
}

let instance: SynthesizerCore | null = null;
export function getSynthesizer(): SynthesizerCore {
  if (!instance) instance = new SynthesizerCore();
  return instance;
}

export const synthesize = (prompt: string, options: any = {}) =>
  getSynthesizer().synthesize(prompt, options);
