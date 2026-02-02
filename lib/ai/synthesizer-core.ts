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
      thinkingBudget: 4096,
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
      thinkingBudget: 1024,
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

  /**
   * Emergency Grid Realignment
   * Clears all temporary cooldowns.
   */
  public realignGrid() {
    this.failedProviders.clear();
    return true;
  }

  public async synthesize(prompt: string, options: any = {}): Promise<any> {
    const now = Date.now();
    
    // 1. Housekeeping: Remove expired failures
    for (const [id, expiry] of this.failedProviders.entries()) {
      if (now > expiry) this.failedProviders.delete(id);
    }

    const history = options.history || [];
    const systemPrompt = options.systemPrompt || "You are a world-class pedagogy master.";
    const isMassiveTask = prompt.length > 8000 || prompt.includes('MASTER MD') || prompt.includes('LINEARIZATION');
    const preferredProviderId = options.preferred;

    // 2. Identify Candidates
    let candidates = Array.from(this.providers.values())
      .filter(p => p.enabled && !this.failedProviders.has(p.id));

    // 3. Grid Exhaustion Logic: Auto-Realignment
    // If we have enabled providers but they are ALL cooling down, clear the grid.
    if (candidates.length === 0) {
      const anyEnabled = Array.from(this.providers.values()).some(p => p.enabled);
      if (anyEnabled) {
        console.log("🔄 [Grid] All nodes cooling. Auto-realigning grid for immediate retry...");
        this.failedProviders.clear();
        candidates = Array.from(this.providers.values()).filter(p => p.enabled);
      }
    }

    if (candidates.length === 0) {
      throw new Error("GRID_FAULT: All neural segments are offline. Verify environment keys.");
    }

    // 4. Prioritization
    candidates.sort((a, b) => {
      // Priority 1: User Preference
      if (preferredProviderId) {
        if (a.id.includes(preferredProviderId)) return -1;
        if (b.id.includes(preferredProviderId)) return 1;
      }
      
      // Priority 2: Task Scaling
      if (isMassiveTask) return a.tier - b.tier; // Tier 1 first for massive tasks
      return b.tier - a.tier; // Tier 3 (cheaper/faster) first for small tasks
    });

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
          provider.lastError = undefined;
          return { text: content, provider: provider.name };
        }
      } catch (e: any) {
        console.warn(`⚠️ [Synthesizer] Failover from ${provider.name}: ${e.message}`);
        errors.push(`${provider.name}: ${e.message}`);
        provider.lastError = e.message;
        // 5s Cooldown
        this.failedProviders.set(provider.id, Date.now() + 5000); 
      }
    }

    throw new Error(`GRID_FAULT: All providers failed. Logs: ${errors.join(' | ')}`);
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
    hasDocs,
    preferred
  });
};