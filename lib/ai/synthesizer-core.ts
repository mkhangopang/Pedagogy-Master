
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
 * NEURAL PROVIDER CONFIGURATION
 * Optimized for Gemini 3 and high-speed hardware nodes.
 */
export const PROVIDERS: ProviderConfig[] = [
  { name: 'gemini', rpm: 50, rpd: 5000, enabled: isGeminiEnabled() },
  { name: 'cerebras', rpm: 100, rpd: 10000, enabled: !!process.env.CEREBRAS_API_KEY },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY },
  { name: 'sambanova', rpm: 100, rpd: 5000, enabled: !!process.env.SAMBANOVA_API_KEY },
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
 * STRATEGIC SPECIALIZATION
 * Maps user intent to the model best suited for that specific educational task.
 */
export const MODEL_SPECIALIZATION: Record<string, string> = {
  'lookup': 'cerebras', // Ultra-fast response for simple SLO definitions
  'teaching': 'gemini', // Deep reasoning for strategies
  'lesson_plan': 'gemini', // Requires Gemini 3 Thinking Budget
  'assessment': 'deepseek', // Strong logic for distractors and MCQ quality
  'differentiation': 'sambanova', // High context handle for multiple tiers
  'general': 'groq', // Low latency chat
};

export async function synthesize(
  prompt: string,
  history: any[],
  hasDocs: boolean,
  docParts: any[] = [],
  preferredProvider?: string,
  systemInstruction: string = DEFAULT_MASTER_PROMPT
): Promise<{ text: string; provider: string; groundingMetadata?: any }> {
  return await requestQueue.add<{ text: string; provider: string; groundingMetadata?: any }>(async () => {
    const sortedProviders = [...PROVIDERS]
      .filter(p => p.enabled)
      .sort((a, b) => {
        if (a.name === preferredProvider) return -1;
        if (b.name === preferredProvider) return 1;
        return 0;
      });

    for (const config of sortedProviders) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;
      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        
        // Timeout handling
        const timeout = 60000;
        const resultPromise = (callFunction as any)(prompt, history, systemInstruction, hasDocs, docParts);
        
        const response = await Promise.race([
          resultPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
        ]);

        rateLimiter.trackRequest(config.name);

        if (typeof response === 'string') {
          return { text: response, provider: config.name };
        }
        
        return { 
          text: response.text, 
          provider: config.name, 
          groundingMetadata: response.groundingMetadata 
        };
      } catch (e) { 
        console.error(`Node failure: ${config.name}`, e); 
      }
    }
    throw new Error("Neural Grid Exhausted. All nodes offline.");
  });
}
