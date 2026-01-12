
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

export const PROVIDERS: ProviderConfig[] = [
  // Fix: Strictly use process.env.API_KEY for the Gemini provider's enabled status.
  { name: 'gemini', rpm: 15, rpd: 1500, enabled: !!process.env.API_KEY },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY },
  { name: 'sambanova', rpm: 100, rpd: 999999, enabled: !!process.env.SAMBANOVA_API_KEY },
  { name: 'cerebras', rpm: 120, rpd: 999999, enabled: !!process.env.CEREBRAS_API_KEY },
  { name: 'hyperbolic', rpm: 50, rpd: 999999, enabled: !!process.env.HYPERBOLIC_API_KEY },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY },
  { name: 'openrouter', rpm: 50, rpd: 200, enabled: !!process.env.OPENROUTER_API_KEY },
];

export const PROVIDER_FUNCTIONS = {
  deepseek: callDeepSeek,
  cerebras: callCerebras,
  sambanova: callSambaNova,
  hyperbolic: callHyperbolic,
  groq: callGroq,
  openrouter: callOpenRouter,
  gemini: callGemini,
};

export const MODEL_SPECIALIZATION: Record<string, string> = {
  'lookup': 'gemini',
  'teaching': 'deepseek',
  'lesson_plan': 'gemini',
  'assessment': 'cerebras',
  'differentiation': 'sambanova',
  'general': 'groq',
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, providerName: string): Promise<T> {
  let timeoutHandle: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`Node ${providerName} timeout`)), timeoutMs);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  clearTimeout(timeoutHandle!);
  return result;
}

/**
 * CORE SYNTHESIS LOOP
 */
export async function synthesize(
  prompt: string,
  history: any[],
  hasDocs: boolean,
  docParts: any[] = [],
  preferredProvider?: string,
  systemInstruction: string = DEFAULT_MASTER_PROMPT
): Promise<{ text: string; provider: string }> {
  return await requestQueue.add<{ text: string; provider: string }>(async () => {
    const sortedProviders = [...PROVIDERS]
      .filter(p => p.enabled)
      .sort((a, b) => {
        if (a.name === preferredProvider) return -1;
        if (b.name === preferredProvider) return 1;
        // Prioritize Gemini if multimodal assets exist
        if (docParts.length > 0) {
          if (a.name === 'gemini') return -1;
          if (b.name === 'gemini') return 1;
        }
        return 0;
      });

    for (const config of sortedProviders) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;
      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const response = await withTimeout<string>(
          (callFunction as any)(prompt, history, systemInstruction, hasDocs, docParts),
          35000,
          config.name
        );
        rateLimiter.trackRequest(config.name);
        return { text: response, provider: config.name };
      } catch (e) { 
        console.error(`Node failure: ${config.name}`); 
      }
    }
    throw new Error("Neural Grid Exhausted.");
  });
}
