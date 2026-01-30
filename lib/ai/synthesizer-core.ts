import { callGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { callGemini } from './providers/gemini';
import { callDeepSeek } from './providers/deepseek';
import { rateLimiter, ProviderConfig } from './rate-limiter';
import { requestQueue } from './request-queue';
import { DEFAULT_MASTER_PROMPT } from '../../constants';
import { isGeminiEnabled } from '../env-server';

// Session-based node blacklisting to prevent repeated 429/410 failures
const nodeBlacklist = new Map<string, number>();

export const getProvidersConfig = (): (ProviderConfig & { contextCharLimit: number; priority: number })[] => [
  { name: 'gemini', rpm: 50, rpd: 5000, enabled: isGeminiEnabled(), contextCharLimit: 1000000, priority: 1 },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY, contextCharLimit: 128000, priority: 2 },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY, contextCharLimit: 32000, priority: 3 },
  { name: 'openrouter', rpm: 50, rpd: 50000, enabled: !!process.env.OPENROUTER_API_KEY, contextCharLimit: 128000, priority: 4 },
];

export const PROVIDER_FUNCTIONS = {
  gemini: callGemini,
  deepseek: callDeepSeek,
  groq: callGroq,
  openrouter: callOpenRouter,
};

/**
 * NEURAL MESH ORCHESTRATOR (v7.0)
 * Architecture: Self-Healing Priority Grid with Circuit Breaking.
 * Optimized for Sindh Biology 185-page massive curriculum ingestion.
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

    // Filter by enabled, priority, AND blacklist status
    let targetProviders = [...currentProviders]
      .filter(p => p.enabled)
      .filter(p => {
        const blacklistExpiry = nodeBlacklist.get(p.name);
        return !blacklistExpiry || now > blacklistExpiry;
      })
      .sort((a, b) => a.priority - b.priority);
    
    if (targetProviders.length === 0) {
      // If all nodes are blacklisted, clear blacklist and try primary only
      nodeBlacklist.clear();
      targetProviders = [currentProviders[0]];
    }

    // Force Gemini for massive synthesis reduction
    const isMassiveReduction = prompt.includes('FINAL_REDUCE_PROTOCOL') || prompt.length > 35000;
    if (isMassiveReduction) {
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
      // Logic Guard: Prevent payload overflow errors
      if (prompt.length > (config.contextCharLimit * 0.95)) continue;

      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const timeout = isMassiveReduction ? 290000 : 110000;
        
        console.log(`🛰️ [Neural Mesh] Requesting Node: ${config.name}`);
        
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
        console.warn(`⚠️ [Mesh Failover] Node ${config.name} rejected payload: ${errorMsg}`);
        lastError = e;
        
        // CIRCUIT BREAKER: Blacklist nodes that are saturated (429) or gone (410/404)
        if (errorMsg.includes('429') || errorMsg.includes('410') || errorMsg.includes('quota')) {
          console.error(`🔴 [Mesh Control] Node ${config.name} saturated. Isolating for 60s.`);
          nodeBlacklist.set(config.name, Date.now() + 60000);
        }
        
        // Immediate jitter before fallback
        await new Promise(r => setTimeout(r, 1200));
        continue; 
      }
    }
    
    throw lastError || new Error("MESH_EXHAUSTED: All neural grid segments rejected the curriculum node.");
  };

  if (bypassQueue) return await executionTask();
  return await requestQueue.add<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }>(executionTask);
}