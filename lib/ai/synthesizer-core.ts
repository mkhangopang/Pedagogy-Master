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
 * NEURAL PROVIDER CONFIGURATION (v47.0)
 * Optimized for Pedagogical Mastery and Multi-Agent Resilience.
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
 * NEURAL GRID SYNTHESIZER (v43.0)
 * Logic Flow:
 * 1. Prioritize Gemini for any standard-based or pedagogical reasoning.
 * 2. Fallback to Cerebras/Groq for high-speed drafting if Gemini is busy.
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
    
    const isImageTask = systemInstruction.includes('IMAGE_GENERATION_MODE') || prompt.includes('GENERATE_VISUAL');
    
    // DETERMINISTIC TASK ANALYSIS
    const isPedagogyTask = prompt.includes('LESSON PLAN') || prompt.includes('SLO') || prompt.includes('PEDAGOGY') || prompt.includes('CURRICULUM');
    const effectivePreferred = isImageTask ? 'gemini' : (isPedagogyTask ? 'gemini' : preferredProvider);

    const sortedProviders = [...currentProviders]
      .filter(p => p.enabled)
      .sort((a, b) => {
        if (a.name === effectivePreferred) return -1;
        if (b.name === effectivePreferred) return 1;
        
        // If preferred isn't specified, favor Gemini for complex standard matching
        if (isPedagogyTask) {
          if (a.name === 'gemini') return -1;
          if (b.name === 'gemini') return 1;
        }
        
        const highThroughput = ['cerebras', 'sambanova', 'groq'];
        if (highThroughput.includes(a.name) && !highThroughput.includes(b.name)) return -1;
        if (!highThroughput.includes(a.name) && highThroughput.includes(b.name)) return 1;
        
        return 0;
      });

    for (const config of sortedProviders) {
      if (!await rateLimiter.canMakeRequest(config.name, config)) continue;
      
      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const timeout = config.name === 'gemini' ? 95000 : 45000; 
        
        const resultPromise = (callFunction as any)(prompt, history, systemInstruction, hasDocs, docParts, isImageTask);
        
        const response = await Promise.race([
          resultPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Neural Node Timeout')), timeout))
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
        console.error(`❌ Node failure: ${config.name} | ${e.message}`); 
      }
    }
    
    throw new Error("NEURAL GRID EXHAUSTED: Please retry in 15 seconds.");
  });
}