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
 * NEURAL PROVIDER CONFIGURATION (v52.0)
 * Logic: Gemini (Precision) -> Cerebras (Speed) -> Groq (Resilience)
 * Added contextCharLimit to prevent 400 errors on failover.
 */
export const getProvidersConfig = (): (ProviderConfig & { contextCharLimit: number })[] => [
  { name: 'gemini', rpm: 50, rpd: 5000, enabled: isGeminiEnabled(), contextCharLimit: 1000000 },
  { name: 'cerebras', rpm: 120, rpd: 15000, enabled: !!process.env.CEREBRAS_API_KEY, contextCharLimit: 25000 }, // ~8k tokens
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY, contextCharLimit: 25000 },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY, contextCharLimit: 120000 },
  { name: 'sambanova', rpm: 100, rpd: 10000, enabled: !!process.env.SAMBANOVA_API_KEY, contextCharLimit: 40000 },
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
 * NEURAL GRID SYNTHESIZER (v48.0)
 * Optimized for seamless failover with automated context windowing.
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
    
    let targetProviders = [...currentProviders].filter(p => p.enabled);

    // Target Priority: Preferred -> Gemini (if RAG) -> Others
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
        
        // AUTO-WINDOWING: Ensure prompt fits in the active node's context
        let effectivePrompt = prompt;
        if (prompt.length > config.contextCharLimit) {
          console.warn(`✂️ [Context Sync] Truncating prompt for ${config.name} (${prompt.length} -> ${config.contextCharLimit})`);
          // Maintain the structure but trim the content inside the vault tags
          if (prompt.includes('<AUTHORITATIVE_VAULT>')) {
             const parts = prompt.split('</AUTHORITATIVE_VAULT>');
             const vaultPart = parts[0].substring(0, config.contextCharLimit - 2000);
             effectivePrompt = `${vaultPart}\n</AUTHORITATIVE_VAULT>\n${parts[1] || ''}`;
          } else {
             effectivePrompt = prompt.substring(0, config.contextCharLimit);
          }
        }

        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const timeout = config.name === 'gemini' ? 95000 : 30000; 
        
        const response = await Promise.race([
          (callFunction as any)(effectivePrompt, history, systemInstruction, hasDocs, docParts, isImageTask),
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
        const errorMsg = e.message?.toLowerCase() || "";
        const isQuotaError = errorMsg.includes('429') || errorMsg.includes('exhausted') || errorMsg.includes('quota');
        const isContextError = errorMsg.includes('400') || errorMsg.includes('context') || errorMsg.includes('too large');
        
        console.warn(`⚠️ [Node Failure] ${config.name}: ${isQuotaError ? 'QUOTA_EXHAUSTED' : isContextError ? 'CONTEXT_WINDOW_FAULT' : e.message}`);
        
        lastError = e;
        
        // If it's a transient failure (Quota/Timeout/Context), hop to the next node immediately
        if (isQuotaError || isContextError || e.message === 'NODE_TIMEOUT') continue;
        
        // Fatal errors break the loop
        throw e;
      }
    }
    
    throw lastError || new Error("NEURAL GRID EXHAUSTED: All nodes failed to process the request.");
  });
}