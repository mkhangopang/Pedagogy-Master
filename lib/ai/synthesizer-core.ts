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

  private selectionIndices: Map<number, number> = new Map();

  constructor() {
    this.providers = this.initializeProviders();
    this.failedProviders = new Map();
    [1, 2, 3].forEach(t => this.selectionIndices.set(t, 0));
  }

  private initializeProviders(): Map<string, AIProvider> {
    const providers = new Map<string, AIProvider>();

    // TIER 1: HIGH-CAPACITY REASONERS (World-Class Pedagogy)
    providers.set('gemini-pro', {
      id: 'gemini-pro',
      name: 'Gemini 2.0 Pro',
      endpoint: 'native',
      model: 'gemini-2.0-pro-exp',
      apiKeyEnv: 'GEMINI_API_KEY',
      maxTokens: 32768,
      rpm: 1000,
      rpd: 50000,
      tier: 1,
      enabled: true
    });

    providers.set('gemini-thinking', {
      id: 'gemini-thinking',
      name: 'Thinking Grid (Gemini 2.5)',
      endpoint: 'native',
      model: 'gemini-2.5-flash-preview-05-20',
      apiKeyEnv: 'GEMINI_API_KEY',
      maxTokens: 65536,
      thinkingLevel: ThinkingLevel.HIGH,
      rpm: 1000,
      rpd: 50000,
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
      enabled: !!process.env.SAMBANOVA_API_KEY
    });

    providers.set('groq-r1', {
      id: 'groq-r1',
      name: 'Groq (DeepSeek R1)',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'deepseek-r1-distill-llama-70b',
      apiKeyEnv: 'GROQ_API_KEY',
      maxTokens: 8192,
      rpm: 30,
      rpd: 14400,
      tier: 1,
      enabled: !!process.env.GROQ_API_KEY
    });

    // TIER 2: HIGH-SPEED PRODUCTION ENGINES
    providers.set('gemini-flash', {
      id: 'gemini-flash',
      name: 'Gemini 2.0 Flash',
      endpoint: 'native',
      model: 'gemini-2.0-flash',
      apiKeyEnv: 'GEMINI_API_KEY',
      maxTokens: 16384,
      rpm: 15,
      rpd: 1500,
      tier: 2,
      enabled: true
    });

    providers.set('groq-llama', {
      id: 'groq-llama',
      name: 'Groq (Llama 3.3 70B)',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile',
      apiKeyEnv: 'GROQ_API_KEY',
      maxTokens: 8192,
      rpm: 30,
      rpd: 14400,
      tier: 2,
      enabled: !!process.env.GROQ_API_KEY
    });

    providers.set('cerebras', {
      id: 'cerebras',
      name: 'Cerebras Ultra-Fast',
      endpoint: 'https://api.cerebras.ai/v1/chat/completions',
      model: 'llama3.1-70b',
      apiKeyEnv: 'CEREBRAS_API_KEY',
      maxTokens: 8192,
      rpm: 100,
      rpd: 10000,
      tier: 2,
      enabled: !!process.env.CEREBRAS_API_KEY
    });

    providers.set('together', {
      id: 'together',
      name: 'Together AI (Llama 3.1)',
      endpoint: 'https://api.together.xyz/v1/chat/completions',
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      apiKeyEnv: 'TOGETHER_API_KEY',
      maxTokens: 8192,
      rpm: 100,
      rpd: 10000,
      tier: 2,
      enabled: !!process.env.TOGETHER_API_KEY
    });

    // TIER 3: UTILITY & FALLBACK NODES
    providers.set('gemini-flash-lite', {
      id: 'gemini-flash-lite',
      name: 'Gemini 1.5 Flash-Lite',
      endpoint: 'native',
      model: 'gemini-1.5-flash-lite',
      apiKeyEnv: 'GEMINI_API_KEY',
      maxTokens: 8192,
      rpm: 100,
      rpd: 10000,
      tier: 3,
      enabled: true
    });

    providers.set('mistral-free', {
      id: 'mistral-free',
      name: 'Mistral Pixtral',
      endpoint: 'https://api.mistral.ai/v1/chat/completions',
      model: 'mistral-large-latest',
      apiKeyEnv: 'API_MISTRAL',
      maxTokens: 8192,
      rpm: 20,
      rpd: 5000,
      tier: 3,
      enabled: !!process.env.API_MISTRAL
    });

    providers.set('deepseek-chat', {
      id: 'deepseek-chat',
      name: 'DeepSeek Chat',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      maxTokens: 8192,
      rpm: 100,
      rpd: 10000,
      tier: 3,
      enabled: !!process.env.DEEPSEEK_API_KEY
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
      enabled: !!process.env.OPENROUTER_API_KEY
    });

    return providers;
  }

  public realignGrid() {
    this.failedProviders.clear();
    [1, 2, 3].forEach(t => this.selectionIndices.set(t, 0));
    console.log("⚡ [Grid] All nodes re-initialized for synthesis.");
  }

  public async *synthesizeStream(prompt: string, options: any = {}): AsyncGenerator<string> {
    const now = Date.now();
    const history = options.history || [];
    const systemPrompt = options.systemPrompt || "You are a world-class pedagogy master.";
    const complexity = options.complexity || 2; 

    const targetTier = complexity >= 3 ? 1 : (complexity === 1 ? 3 : 2);
    const allEnabled = Array.from(this.providers.values()).filter(p => p.enabled);
    
    const candidates = allEnabled
      .filter(p => !this.failedProviders.has(p.id) || now > (this.failedProviders.get(p.id)?.until || 0))
      .sort((a, b) => {
        const scoreA = Math.abs(a.tier - targetTier);
        const scoreB = Math.abs(b.tier - targetTier);
        if (scoreA !== scoreB) return scoreA - scoreB;
        const idxA = allEnabled.indexOf(a);
        const idxB = allEnabled.indexOf(b);
        const offset = this.selectionIndices.get(a.tier) || 0;
        return ((idxA + offset) % allEnabled.length) - ((idxB + offset) % allEnabled.length);
      });

    if (candidates.length === 0) {
      yield "AI Alert: Synthesis grid saturated. Emergency realignment initiated...";
      this.realignGrid();
      return;
    }

    for (const provider of candidates) {
      this.selectionIndices.set(provider.tier, (this.selectionIndices.get(provider.tier) || 0) + 1);

      try {
        let apiKey = (provider.apiKeyEnv === 'GEMINI_API_KEY' || provider.apiKeyEnv === 'API_KEY')
          ? resolveApiKey() 
          : process.env[provider.apiKeyEnv];
          
        if (!apiKey && provider.id.includes('groq')) {
          apiKey = process.env.GROQ_API_KEY || process.env.API_KEY;
        }

        if (!apiKey) continue;

        if (provider.endpoint === 'native') {
          const ai = new GoogleGenAI({ apiKey });
          const feedbackStream = await ai.models.generateContentStream({
            model: provider.model,
            contents: [
              ...history.map((h: any) => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
              { role: 'user', parts: [{ text: prompt }] }
            ],
            config: { 
              systemInstruction: systemPrompt,
              temperature: 0.1,
              maxOutputTokens: provider.maxTokens,
              thinkingConfig: provider.thinkingLevel ? { thinkingLevel: provider.thinkingLevel } : undefined
            }
          });
          for await (const chunk of feedbackStream) {
             if (chunk.text) yield chunk.text;
          }
          return;
        } else {
          const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map((h: any) => ({ role: h.role, content: h.content })),
            { role: 'user', content: prompt }
          ];

          const res = await fetch(provider.endpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: provider.model, messages, temperature: 0.1, stream: false })
          });
          if (!res.ok) throw new Error(`Node_Error_${res.status}`);
          const data = await res.json();
          yield data.choices[0].message.content;
          return;
        }
      } catch (e: any) {
        const msg = e?.message || "Unknown error";
        const cooldown = msg.includes('429') ? 600000 : 60000;
        this.failedProviders.set(provider.id, { until: Date.now() + cooldown, retries: 0 });
        console.warn(`🔴 [Grid Stream] Node ${provider.name} saturated. Failover initiated. Error: ${msg}`);
      }
    }
  }

  public async synthesize(prompt: string, options: any = {}): Promise<any> {
    const now = Date.now();
    const history = options.history || [];
    const systemPrompt = options.systemPrompt || "You are a world-class pedagogy master.";
    const complexity = options.complexity || 2; 

    const targetTier = complexity >= 3 ? 1 : (complexity === 1 ? 3 : 2);
    
    const allEnabled = Array.from(this.providers.values()).filter(p => p.enabled);
    
    const candidates = allEnabled
      .filter(p => !this.failedProviders.has(p.id) || now > (this.failedProviders.get(p.id)?.until || 0))
      .sort((a, b) => {
        const scoreA = Math.abs(a.tier - targetTier);
        const scoreB = Math.abs(b.tier - targetTier);
        if (scoreA !== scoreB) return scoreA - scoreB;
        
        const idxA = allEnabled.indexOf(a);
        const idxB = allEnabled.indexOf(b);
        const offset = this.selectionIndices.get(a.tier) || 0;
        return ((idxA + offset) % allEnabled.length) - ((idxB + offset) % allEnabled.length);
      });

    if (candidates.length === 0) {
      console.warn("⚠️ [Grid] All nodes temporarily saturated. Emergency realignment.");
      this.realignGrid();
      return this.synthesize(prompt, options);
    }

    for (const provider of candidates) {
      this.selectionIndices.set(provider.tier, (this.selectionIndices.get(provider.tier) || 0) + 1);

      try {
        let apiKey = (provider.apiKeyEnv === 'GEMINI_API_KEY' || provider.apiKeyEnv === 'API_KEY')
          ? resolveApiKey() 
          : process.env[provider.apiKeyEnv];
          
        if (!apiKey && provider.id.includes('groq')) {
          apiKey = process.env.GROQ_API_KEY || process.env.API_KEY;
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
              maxOutputTokens: provider.maxTokens,
              thinkingConfig: provider.thinkingLevel ? { thinkingLevel: provider.thinkingLevel } : undefined
            }
          });
          return { text: res.text, provider: provider.name };
        } else {
          const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map((h: any) => ({ role: h.role, content: h.content })),
            { role: 'user', content: prompt }
          ];

          const res = await fetch(provider.endpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: provider.model,
              messages,
              temperature: 0.1
            })
          });
          if (!res.ok) throw new Error(`Node_Error_${res.status}`);
          const data = await res.json();
          return { text: data.choices[0].message.content, provider: provider.name };
        }
      } catch (e: any) {
        const msg = e?.message || "Unknown error";
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
      status: !p.enabled ? 'disabled' : (this.failedProviders.has(p.id) && now < (this.failedProviders.get(p.id)?.until || 0)) ? 'saturated' : 'active',
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
export const synthesizeStream = (prompt: string, options: any = {}) => getSynthesizer().synthesizeStream(prompt, options);
