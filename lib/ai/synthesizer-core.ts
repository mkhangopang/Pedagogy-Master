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
 * WORLD-CLASS SYNTHESIZER ORCHESTRATOR (v4.6)
 * Stable Grid Enforcement: Gemini, DeepSeek, Groq.
 * Removed volatile SambaNova/Cerebras nodes to prevent segment faults.
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
      throw new Error("NO_NODES_AVAILABLE: Verify your Gemini or DeepSeek API keys.");
    }
    
    // Sort providers by reliability for large context
    const reasoningOrder = ['gemini', 'deepseek', 'groq'];
    targetProviders.sort((a, b) => reasoningOrder.indexOf(a.name) - reasoningOrder.indexOf(b.name));

    // Handle Preferred Provider Re-routing (e.g., forcing Gemini for Reduce phase)
    if (preferredProvider) {
      const preferred = targetProviders.find(p => p.name === preferredProvider);
      if (preferred) {
        targetProviders = [preferred, ...targetProviders.filter(p => p.name !== preferredProvider)];
      }
    }

    let lastError = null;
    for (const config of targetProviders) {
      if (!config.enabled) continue;

      // SAFETY: Context window guard
      if (prompt.length > (config.contextCharLimit * 0.95)) {
        console.warn(`⏭️ [Context] Skipping ${config.name} - Prompt too dense.`);
        continue;
      }

      if (!await rateLimiter.canMakeRequest(config.name, config)) continue;
      
      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        // High fidelity synthesis for complex merged data
        const isReducePhase = prompt.includes('REDUCE') || prompt.length > 40000;
        const timeout = isReducePhase ? 280000 : 95000;
        
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
        console.warn(`⚠️ [Node Fault] ${config.name}: ${e.message}`);
        lastError = e;
        // Continue to next provider in the chain
        continue; 
      }
    }
    throw lastError || new Error("GRID_FAILURE: All stable synthesis nodes are currently saturated.");
  };

  if (bypassQueue) return await executionTask();
  return await requestQueue.add<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }>(executionTask);
}