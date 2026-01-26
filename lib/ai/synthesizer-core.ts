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
 * NEURAL PROVIDER CONFIGURATION (v45.0)
 * Integrated with full neural grid models.
 */
export const getProvidersConfig = (): ProviderConfig[] => [
  { name: 'gemini', rpm: 50, rpd: 5000, enabled: isGeminiEnabled() },
  { name: 'cerebras', rpm: 120, rpd: 15000, enabled: !!process.env.CEREBRAS_API_KEY },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY },
  { name: 'sambanova', rpm: 100, rpd: 10000, enabled: !!process.env.SAMBANOVA_API_KEY },
  { name: 'openrouter', rpm: 10, rpd: 1000, enabled: !!process.env.OPENROUTER_API_KEY },
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
 * STRATEGIC SPECIALIZATION (v3.0)
 * DYNAMIC THROTTLING: Simple tasks are routed to high-throughput nodes (Cerebras/Groq)
 * to preserve Gemini token budgets for complex pedagogical synthesis.
 */
export const MODEL_SPECIALIZATION: Record<string, string> = {
  'lookup': 'cerebras', 
  'teaching': 'sambanova', 
  'lesson_plan': 'gemini', 
  'assessment': 'gemini', 
  'differentiation': 'gemini',
  'slo-tagger': 'deepseek',
  'general': 'groq', 
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
    const currentProviders = getProvidersConfig();
    
    // AUDIT RECOMMENDATION: DYNAMIC PROVIDER THROTTLING
    // Reorder providers based on health and specialization
    const sortedProviders = [...currentProviders]
      .filter(p => p.enabled)
      .sort((a, b) => {
        // Priority 1: Match preferred or specialized model
        if (a.name === preferredProvider) return -1;
        if (b.name === preferredProvider) return 1;
        
        // Priority 2: Use high-throughput fallbacks for general chat
        if (!preferredProvider) {
          const highThroughput = ['cerebras', 'sambanova', 'groq'];
          if (highThroughput.includes(a.name) && !highThroughput.includes(b.name)) return -1;
          if (!highThroughput.includes(a.name) && highThroughput.includes(b.name)) return 1;
        }
        return 0;
      });

    for (const config of sortedProviders) {
      if (!await rateLimiter.canMakeRequest(config.name, config)) {
        console.warn(`⚠️ [Throttling] Node ${config.name} reached capacity. Routing to next grid segment.`);
        continue;
      }
      
      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        
        // Increased timeout resilience for deeper reasoning models
        const timeout = config.name === 'gemini' ? 90000 : 45000; 
        const resultPromise = (callFunction as any)(prompt, history, systemInstruction, hasDocs, docParts);
        
        const response = await Promise.race([
          resultPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Neural Node Timeout')), timeout))
        ]);

        if (typeof response === 'string') {
          return { text: response, provider: config.name };
        }
        
        return { 
          text: response.text, 
          provider: config.name, 
          groundingMetadata: response.groundingMetadata 
        };
      } catch (e: any) { 
        console.error(`❌ Node failure: ${config.name} | ${e.message}`); 
        // Transparently fall through to next provider in the sorted list
      }
    }
    throw new Error("NEURAL GRID EXHAUSTED: All synthesis nodes are currently saturated or unreachable. Increase provider coverage in Environment Variables.");
  });
}
