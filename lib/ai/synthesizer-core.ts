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

/**
 * NEURAL PROVIDER CONFIGURATION (v50.0)
 * Logic: Gemini (Precision) -> Cerebras (Speed) -> Groq (Resilience)
 */
export const getProvidersConfig = (): ProviderConfig[] => [
  { name: 'gemini', rpm: 50, rpd: 5000, enabled: isGeminiEnabled() },
  { name: 'cerebras', rpm: 120, rpd: 15000, enabled: !!process.env.CEREBRAS_API_KEY },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY },
  { name: 'sambanova', rpm: 100, rpd: 10000, enabled: !!process.env.SAMBANOVA_API_KEY },
];

export const PROVIDER_FUNCTIONS = {
  deepseek: callDeepSeek,
  cerebras: callCerebras,
  sambanova: callSambaNova,
  hyperbolic: callHyperbolic,
  groq: callGroq,
  openrouter: callOpenRouter,
  gemini: callGemini
};

/**
 * NEURAL GRID SYNTHESIZER (v46.0)
 * FAILOVER LOGIC: Quota Exhaustion (429) triggers automatic node hopping.
 */
export async function synthesize(
  prompt: string,
  history: any[],
  hasDocs: boolean,
  docParts: any[] = [],
  preferredProvider?: string,
  systemInstruction: string = DEFAULT_MASTER_PROMPT
): Promise<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }> {
  return await requestQueue.add<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }>(async () => {
    const currentProviders = getProvidersConfig();
    
    const isRAGTask = hasDocs || prompt.includes('<AUTHORITATIVE_VAULT>');
    const isImageTask = systemInstruction.includes('IMAGE_GENERATION_MODE') || prompt.includes('GENERATE_VISUAL');
    
    // Prioritize Gemini for RAG, but DO NOT hard-lock. Allow fallback if quota is hit.
    let targetProviders = [...currentProviders].filter(p => p.enabled);

    // Sort to put the preferred (or Gemini for RAG) first
    const primaryChoice = preferredProvider || (isRAGTask ? 'gemini' : targetProviders[0]?.name);
    
    targetProviders.sort((a, b) => {
      if (a.name === primaryChoice) return -1;
      if (b.name === primaryChoice) return 1;
      return 0;
    });

    let lastError = null;

    for (const config of targetProviders) {
      if (!await rateLimiter.canMakeRequest(config.name, config)) continue;
      
      try {
        console.log(`📡 [Synthesizer] Attempting Node: ${config.name}`);
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const timeout = config.name === 'gemini' ? 95000 : 30000; 
        
        const response = await Promise.race([
          (callFunction as any)(prompt, history, systemInstruction, hasDocs, docParts, isImageTask),
          new Promise((_, reject) => setTimeout(() => reject(new Error('NODE_TIMEOUT')), timeout))
        ]);

        if (typeof response === 'string') {
          return { text: response, provider: config.name };
        }
        
        return { 
          text: response.text || "Synthesis complete.", 
          provider: config.name, 
          groundingMetadata: response.groundingMetadata,
          imageUrl: response.imageUrl
        };
      } catch (e: any) { 
        const isQuotaError = e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED') || e.message?.includes('quota');
        console.warn(`⚠️ [Node Failure] ${config.name}: ${isQuotaError ? 'QUOTA_EXHAUSTED' : e.message}`);
        
        lastError = e;
        // If it's a quota error or timeout, we immediately hop to the next provider
        if (isQuotaError || e.message === 'NODE_TIMEOUT') continue;
        
        // If it's a fatal logic error, throw it
        throw e;
      }
    }
    
    throw lastError || new Error("NEURAL GRID EXHAUSTED: All nodes failed to respond.");
  });
}