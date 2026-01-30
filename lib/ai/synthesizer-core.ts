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

// Session-based node blacklisting to prevent repeated 429/410/402/500 failures
const nodeBlacklist = new Map<string, number>();

/**
 * NEURAL MESH CONFIGURATION (v12.0)
 * Engaging 7-Node Multi-Provider Failover Grid
 */
export const getProvidersConfig = (): (ProviderConfig & { contextCharLimit: number; priority: number })[] => [
  { name: 'gemini', rpm: 50, rpd: 5000, enabled: isGeminiEnabled(), contextCharLimit: 1000000, priority: 1 },
  { name: 'cerebras', rpm: 30, rpd: 10000, enabled: !!process.env.CEREBRAS_API_KEY, contextCharLimit: 64000, priority: 2 },
  { name: 'sambanova', rpm: 20, rpd: 5000, enabled: !!process.env.SAMBANOVA_API_KEY, contextCharLimit: 64000, priority: 3 },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY, contextCharLimit: 32000, priority: 4 },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY, contextCharLimit: 128000, priority: 5 },
  { name: 'hyperbolic', rpm: 10, rpd: 2000, enabled: !!process.env.HYPERBOLIC_API_KEY, contextCharLimit: 64000, priority: 6 },
  { name: 'openrouter', rpm: 50, rpd: 50000, enabled: !!process.env.OPENROUTER_API_KEY, contextCharLimit: 128000, priority: 7 },
];

export const PROVIDER_FUNCTIONS = {
  gemini: callGemini,
  cerebras: callCerebras,
  sambanova: callSambaNova,
  groq: callGroq,
  deepseek: callDeepSeek,
  hyperbolic: callHyperbolic,
  openrouter: callOpenRouter,
};

/**
 * NEURAL MESH ORCHESTRATOR
 * Architecture: Self-Healing Priority Grid with Circuit Breaking.
 * Optimized for Quad-Grade Sindh Biology 2024.
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
    const now = Date.now();

    // 1. Filter nodes by availability and health
    let targetProviders = [...currentProviders]
      .filter(p => p.enabled)
      .filter(p => {
        const blacklistExpiry = nodeBlacklist.get(p.name);
        return !blacklistExpiry || now > blacklistExpiry;
      })
      .sort((a, b) => a.priority - b.priority);
    
    if (targetProviders.length === 0) {
      console.warn("⚠️ All nodes blacklisted. Resetting grid health.");
      nodeBlacklist.clear();
      targetProviders = [currentProviders[0]];
    }

    // 2. Task Routing Logic
    const isMassiveTask = prompt.includes('FINAL_REDUCE_PROTOCOL') || prompt.length > 35000;
    const isInstantTool = prompt.includes('LESSON PLAN') || prompt.includes('QUIZ');

    if (isMassiveTask) {
      preferredProvider = 'gemini'; // Only Gemini handles 1M context reliably
    } else if (isInstantTool && !preferredProvider) {
      preferredProvider = 'cerebras'; // Cerebras is the fastest for short tools
    }

    if (preferredProvider) {
      const preferred = targetProviders.find(p => p.name === preferredProvider);
      if (preferred) {
        targetProviders = [preferred, ...targetProviders.filter(p => p.name !== preferredProvider)];
      }
    }

    let lastError = null;
    for (const config of targetProviders) {
      // Context safety check
      if (prompt.length > (config.contextCharLimit * 0.95)) {
         console.warn(`⏭️ Skipping Node ${config.name}: Payload exceeds context limit.`);
         continue;
      }

      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const timeout = isMassiveTask ? 290000 : 90000;
        
        console.log(`🛰️ [Neural Mesh] Engaged Node: ${config.name.toUpperCase()}`);
        
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
        const errorMsg = e.message || "";
        console.warn(`⚠️ [Grid Failover] Node ${config.name} rejected: ${errorMsg}`);
        lastError = e;
        
        // CIRCUIT BREAKER: Isolate failing nodes (Rate Limit, Deprecated, No Credits)
        if (errorMsg.includes('429') || errorMsg.includes('410') || errorMsg.includes('402') || errorMsg.includes('quota') || errorMsg.includes('NODE_TIMEOUT')) {
          console.error(`🔴 [Grid Control] Isolating node ${config.name} for 90s.`);
          nodeBlacklist.set(config.name, Date.now() + 90000);
        }
        
        await new Promise(r => setTimeout(r, 1500));
        continue; 
      }
    }
    
    throw lastError || new Error("GRID_BLACKOUT: All 7 neural segments rejected the curriculum node.");
  };

  if (bypassQueue) return await executionTask();
  return await requestQueue.add<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }>(executionTask);
}