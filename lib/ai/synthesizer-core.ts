import { callGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { callGemini } from './providers/gemini';
import { callDeepSeek } from './providers/deepseek';
import { callCerebras } from './providers/cerebras';
import { callSambaNova } from './providers/sambanova';
import { callHyperbolic } from './providers/hyperbolic';
import { callOpenAI } from './providers/openai';
import { rateLimiter, ProviderConfig } from './rate-limiter';
import { requestQueue } from './request-queue';
import { DEFAULT_MASTER_PROMPT } from '../../constants';
import { isGeminiEnabled } from '../env-server';

export const getProvidersConfig = (): (ProviderConfig & { contextCharLimit: number })[] => [
  { name: 'gemini', rpm: 50, rpd: 5000, enabled: isGeminiEnabled(), contextCharLimit: 1000000 },
  { name: 'openai', rpm: 100, rpd: 10000, enabled: !!process.env.OPENAI_API_KEY, contextCharLimit: 128000 },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY, contextCharLimit: 128000 },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY, contextCharLimit: 32000 },
  { name: 'cerebras', rpm: 120, rpd: 15000, enabled: !!process.env.CEREBRAS_API_KEY, contextCharLimit: 32000 },
  { name: 'sambanova', rpm: 100, rpd: 10000, enabled: !!process.env.SAMBANOVA_API_KEY, contextCharLimit: 40000 },
];

export const PROVIDER_FUNCTIONS = {
  openai: callOpenAI,
  gemini: callGemini,
  deepseek: callDeepSeek,
  groq: callGroq,
  cerebras: callCerebras,
  sambanova: callSambaNova,
  hyperbolic: callHyperbolic,
  openrouter: callOpenRouter,
};

/**
 * WORLD-CLASS SYNTHESIZER ORCHESTRATOR
 * Optimized for distributed client-side processing.
 */
export async function synthesize(
  prompt: string,
  history: any[],
  hasDocs: boolean,
  docParts: any[] = [],
  preferredProvider?: string,
  systemInstruction: string = DEFAULT_MASTER_PROMPT,
  bypassQueue: boolean = false
): Promise<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }> {
  
  const executionTask = async () => {
    const currentProviders = getProvidersConfig();
    let targetProviders = [...currentProviders].filter(p => p.enabled);
    
    // Sort providers by reasoning capability
    const reasoningOrder = ['gemini', 'openai', 'deepseek', 'groq'];
    targetProviders.sort((a, b) => reasoningOrder.indexOf(a.name) - reasoningOrder.indexOf(b.name));

    if (preferredProvider && targetProviders.some(p => p.name === preferredProvider)) {
      targetProviders = [
        targetProviders.find(p => p.name === preferredProvider)!,
        ...targetProviders.filter(p => p.name !== preferredProvider)
      ];
    }

    let lastError = null;
    for (const config of targetProviders) {
      if (!await rateLimiter.canMakeRequest(config.name, config)) continue;
      
      try {
        let effectivePrompt = prompt;
        if (prompt.length > config.contextCharLimit) {
          effectivePrompt = prompt.substring(0, config.contextCharLimit);
        }

        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        // High fidelity synthesis for complex merged data
        const isReducePhase = prompt.includes('isReduce: true') || prompt.length > 50000;
        const timeout = isReducePhase ? 240000 : 90000;
        
        const response = await Promise.race([
          (callFunction as any)(effectivePrompt, history, systemInstruction, hasDocs, docParts),
          new Promise((_, reject) => setTimeout(() => reject(new Error('NODE_TIMEOUT')), timeout))
        ]);

        if (typeof response === 'string') return { text: response, provider: config.name };
        return { 
          text: response.text || "Synthesis complete.", 
          provider: config.name, 
          groundingMetadata: response.groundingMetadata,
          imageUrl: response.imageUrl
        };
      } catch (e: any) { 
        console.warn(`⚠️ [Node Fault] ${config.name}: ${e.message}`);
        lastError = e;
        continue; 
      }
    }
    throw lastError || new Error("GRID_EXHAUSTED: Multi-provider synthesis failed.");
  };

  if (bypassQueue) return await executionTask();
  return await requestQueue.add<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }>(executionTask);
}
