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
 * NEURAL PROVIDER CONFIGURATION (v49.0)
 * Optimized for Stability and Zero-Hallucination RAG.
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
 * NEURAL GRID SYNTHESIZER (v45.0)
 * CRITICAL FIX: Direct routing for Document-Anchored tasks to Gemini 3 Pro.
 * Prevents "Token Vomit" collapse seen in Llama-based secondary providers.
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
    
    // DETECT RAG INTENT
    const isRAGTask = hasDocs || prompt.includes('<AUTHORITATIVE_VAULT>');
    const isImageTask = systemInstruction.includes('IMAGE_GENERATION_MODE') || prompt.includes('GENERATE_VISUAL');
    
    // HARD-LOCK: RAG and standard-based reasoning MUST use Gemini for reliability
    let effectivePreferred = preferredProvider;
    if (isRAGTask || isImageTask) {
      effectivePreferred = 'gemini';
    }

    const sortedProviders = [...currentProviders]
      .filter(p => p.enabled)
      .sort((a, b) => {
        if (a.name === effectivePreferred) return -1;
        if (b.name === effectivePreferred) return 1;
        return 0;
      });

    for (const config of sortedProviders) {
      if (!await rateLimiter.canMakeRequest(config.name, config)) continue;
      
      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        // Give the primary node more time for deep reasoning
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
        // If Gemini fails, we proceed to next provider only if not a high-fidelity RAG task
        if (isRAGTask && config.name === 'gemini') {
          // If gemini is down and we need RAG, we continue to others but with warning
          console.warn("⚠️ Primary RAG node down, falling back to secondary providers.");
        }
      }
    }
    
    throw new Error("NEURAL GRID EXHAUSTED: Please retry in 15 seconds.");
  });
}