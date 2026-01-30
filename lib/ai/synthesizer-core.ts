import { callGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { callGemini } from './providers/gemini';
import { callDeepSeek } from './providers/deepseek';
import { rateLimiter, ProviderConfig } from './rate-limiter';
import { requestQueue } from './request-queue';
import { DEFAULT_MASTER_PROMPT } from '../../constants';
import { isGeminiEnabled } from '../env-server';

export const getProvidersConfig = (): (ProviderConfig & { contextCharLimit: number })[] => [
  { name: 'gemini', rpm: 50, rpd: 5000, enabled: isGeminiEnabled(), contextCharLimit: 1000000 },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY, contextCharLimit: 128000 },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY, contextCharLimit: 32000 },
];

export const PROVIDER_FUNCTIONS = {
  gemini: callGemini,
  deepseek: callDeepSeek,
  groq: callGroq,
  openrouter: callOpenRouter,
};

/**
 * WORLD-CLASS SYNTHESIZER ORCHESTRATOR (v5.5)
 * Stable Grid: Gemini, DeepSeek, Groq. 
 * Optimized for high-volume Pakistan Curriculum Ingestion.
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
      throw new Error("NO_STABLE_NODES: Ensure API_KEY (Gemini) is configured in Vercel.");
    }
    
    // Sort by stability and capacity
    const reasoningOrder = ['gemini', 'deepseek', 'groq'];
    targetProviders.sort((a, b) => reasoningOrder.indexOf(a.name) - reasoningOrder.indexOf(b.name));

    // Force Preferred Provider for critical phases
    if (preferredProvider) {
      const preferred = targetProviders.find(p => p.name === preferredProvider);
      if (preferred) {
        targetProviders = [preferred, ...targetProviders.filter(p => p.name !== preferredProvider)];
      }
    }

    let lastError = null;
    for (const config of targetProviders) {
      if (!config.enabled) continue;

      // Logic Guard: Context size mismatch
      if (prompt.length > (config.contextCharLimit * 0.9)) {
        console.warn(`⏭️ [Grid Guard] Skipping ${config.name} - Capacity mismatch.`);
        continue;
      }

      if (!await rateLimiter.canMakeRequest(config.name, config)) continue;
      
      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        // 185-page reduction tasks need significant context time
        const isReduction = prompt.includes('FINAL_REDUCE_PROTOCOL') || prompt.length > 35000;
        const timeout = isReduction ? 260000 : 95000;
        
        const response = await Promise.race([
          (callFunction as any)(prompt, history, systemInstruction, hasDocs, docParts),
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
        console.warn(`⚠️ [Node Bypass] ${config.name}: ${e.message}`);
        lastError = e;
        
        // Failover cooling delay
        if (e.message.includes('429')) {
          await new Promise(r => setTimeout(r, 1500));
        }
        continue; 
      }
    }
    throw lastError || new Error("GRID_EXHAUSTED: Document complexity exceeds current node windows.");
  };

  if (bypassQueue) return await executionTask();
  return await requestQueue.add<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }>(executionTask);
}
