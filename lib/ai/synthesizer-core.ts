import { callGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { callGemini } from './providers/gemini';
import { callDeepSeek } from './providers/deepseek';
import { callCerebras } from './providers/cerebras';
import { callSambaNova } from './providers/sambanova';
import { callHyperbolic } from './providers/hyperbolic';
import { rateLimiter, ProviderConfig } from './rate-limiter';
import { requestQueue } from './request-queue';
import { DEFAULT_MASTER_PROMPT } from '../../constants';
import { isGeminiEnabled } from '../env-server';

export const getProvidersConfig = (): (ProviderConfig & { contextCharLimit: number })[] => [
  { name: 'gemini', rpm: 50, rpd: 5000, enabled: isGeminiEnabled(), contextCharLimit: 1000000 },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY, contextCharLimit: 128000 },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY, contextCharLimit: 32000 },
  { name: 'cerebras', rpm: 120, rpd: 15000, enabled: !!process.env.CEREBRAS_API_KEY, contextCharLimit: 32000 },
  { name: 'sambanova', rpm: 100, rpd: 10000, enabled: !!process.env.SAMBANOVA_API_KEY, contextCharLimit: 40000 },
];

export const PROVIDER_FUNCTIONS = {
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
 * OpenAI removed from grid per user request.
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
    
    if (targetProviders.length === 0) {
      throw new Error("NO_NODES_AVAILABLE: Ensure API_KEY (Gemini) or DEEPSEEK_API_KEY are configured in environment.");
    }
    
    // Sort providers by reasoning capability (Removed OpenAI)
    const reasoningOrder = ['gemini', 'deepseek', 'groq', 'sambanova'];
    targetProviders.sort((a, b) => reasoningOrder.indexOf(a.name) - reasoningOrder.indexOf(b.name));

    // Handle Preferred Provider Re-routing
    if (preferredProvider) {
      const preferred = targetProviders.find(p => p.name === preferredProvider);
      if (preferred) {
        targetProviders = [preferred, ...targetProviders.filter(p => p.name !== preferredProvider)];
      }
      // If preferred isn't enabled, we just use the sorted targetProviders list (Automatic Failover)
    }

    let lastError = null;
    for (const config of targetProviders) {
      // Immediate Skip: Unconfigured providers
      if (!config.enabled) continue;

      if (!await rateLimiter.canMakeRequest(config.name, config)) {
        console.warn(`🕒 [Rate Limit] Node ${config.name} throttled. Failing over...`);
        continue;
      }
      
      try {
        let effectivePrompt = prompt;
        if (prompt.length > config.contextCharLimit) {
          effectivePrompt = prompt.substring(0, config.contextCharLimit);
        }

        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        // High fidelity synthesis for complex merged data
        const isReducePhase = prompt.includes('[REDUCE_PHASE_ACTIVE]') || prompt.length > 50000;
        const timeout = isReducePhase ? 240000 : 95000;
        
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
