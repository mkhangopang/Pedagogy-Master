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

/**
 * NEURAL PROVIDER GRID (v60.0)
 * Tier 1: Gemini 3 Pro, GPT-4o, DeepSeek R1 (Reasoning)
 * Tier 2: Groq, Cerebras, SambaNova (Inference Speed)
 */
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
    const isMappingTask = prompt.includes('PEDAGOGICAL MARKDOWN') || prompt.includes('SLO');
    
    // Dynamically sort providers based on the specific task
    // If it's a mapping task, prioritize reasoning models (Gemini/OpenAI/DeepSeek)
    let targetProviders = [...currentProviders].filter(p => p.enabled);
    
    if (isMappingTask) {
      const reasoningOrder = ['gemini', 'openai', 'deepseek', 'groq'];
      targetProviders.sort((a, b) => {
        const idxA = reasoningOrder.indexOf(a.name);
        const idxB = reasoningOrder.indexOf(b.name);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    }

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
        console.log(`📡 [Synthesizer] Engaging Node: ${config.name} for ${isMappingTask ? 'REASONING' : 'CHATTING'}`);
        
        let effectivePrompt = prompt;
        if (prompt.length > config.contextCharLimit) {
          effectivePrompt = prompt.substring(0, config.contextCharLimit);
        }

        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const timeout = 110000; // Increased timeout for heavy reasoning
        
        const response = await Promise.race([
          (callFunction as any)(effectivePrompt, history, systemInstruction, hasDocs, docParts),
          new Promise((_, reject) => setTimeout(() => reject(new Error('NODE_TIMEOUT')), timeout))
        ]);

        if (typeof response === 'string') {
          // If response is too short and it was a mapping task, consider it a partial failure and try next
          if (isMappingTask && response.length < 500 && targetProviders.length > 1) {
            console.warn(`⚠️ [Node Quality Warning] ${config.name} returned suspiciously short mapping. Hopping...`);
            continue;
          }
          return { text: response, provider: config.name };
        }
        
        return { 
          text: response.text || "Synthesis complete.", 
          provider: config.name, 
          groundingMetadata: response.groundingMetadata,
          imageUrl: response.imageUrl
        };
      } catch (e: any) { 
        console.warn(`⚠️ [Node Fault] ${config.name}: ${e.message}`);
        lastError = e;
        continue; // Keep hopping until we exhaust the grid
      }
    }
    
    throw lastError || new Error("GRID_EXHAUSTED: All neural nodes failed to process the document.");
  });
}
