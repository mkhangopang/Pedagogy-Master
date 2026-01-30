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

// Session-based node blacklisting to prevent repeated failures
const nodeBlacklist = new Map<string, number>();

/**
 * NEURAL MESH CONFIGURATION (v12.5)
 * 7-Node Failover Grid with Aggressive Blacklisting
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

    let targetProviders = [...currentProviders]
      .filter(p => p.enabled)
      .filter(p => {
        const blacklistExpiry = nodeBlacklist.get(p.name);
        return !blacklistExpiry || now > blacklistExpiry;
      })
      .sort((a, b) => a.priority - b.priority);
    
    if (targetProviders.length === 0) {
      nodeBlacklist.clear();
      targetProviders = [currentProviders[0]];
    }

    const isMassiveTask = prompt.includes('FINAL_REDUCE_PROTOCOL') || prompt.length > 35000;
    
    if (isMassiveTask && !nodeBlacklist.has('gemini')) {
      preferredProvider = 'gemini'; 
    }

    if (preferredProvider) {
      const preferred = targetProviders.find(p => p.name === preferredProvider);
      if (preferred) {
        targetProviders = [preferred, ...targetProviders.filter(p => p.name !== preferredProvider)];
      }
    }

    let lastError = null;
    for (const config of targetProviders) {
      if (prompt.length > (config.contextCharLimit * 0.95)) continue;

      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const timeout = isMassiveTask ? 290000 : 90000;
        
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
        const errorMsg = e.message?.toLowerCase() || "";
        console.warn(`⚠️ [Grid Failover] Node ${config.name} rejected: ${errorMsg}`);
        lastError = e;
        
        if (
          errorMsg.includes('429') || 
          errorMsg.includes('resource_exhausted') || 
          errorMsg.includes('quota') || 
          errorMsg.includes('402') || 
          errorMsg.includes('400') || 
          errorMsg.includes('node_timeout')
        ) {
          console.error(`🔴 [Grid Control] Node ${config.name} saturated. Blacklisting for 120s.`);
          nodeBlacklist.set(config.name, Date.now() + 120000);
        }
        
        await new Promise(r => setTimeout(r, 2000));
        continue; 
      }
    }
    
    throw lastError || new Error("GRID_FAILURE: All neural segments rejected the payload.");
  };

  if (bypassQueue) return await executionTask();
  return await requestQueue.add<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }>(executionTask);
}