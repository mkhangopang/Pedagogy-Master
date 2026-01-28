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
 * NEURAL PROVIDER CONFIGURATION (v54.0)
 * Logic: Gemini (Preferred) -> Cerebras (Flash) -> Groq (Resilient) -> SambaNova (Turbo)
 */
export const getProvidersConfig = (): (ProviderConfig & { contextCharLimit: number })[] => [
  { name: 'gemini', rpm: 50, rpd: 5000, enabled: isGeminiEnabled(), contextCharLimit: 1000000 },
  { name: 'cerebras', rpm: 120, rpd: 15000, enabled: !!process.env.CEREBRAS_API_KEY, contextCharLimit: 25000 },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY, contextCharLimit: 25000 },
  { name: 'sambanova', rpm: 100, rpd: 10000, enabled: !!process.env.SAMBANOVA_API_KEY, contextCharLimit: 40000 },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY, contextCharLimit: 120000 },
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
 * NEURAL GRID SYNTHESIZER (v50.0)
 * RESILIENCE LOGIC: Treat 404/400/500 as transient node faults and keep hopping.
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

    // Initial node selection logic
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
        console.log(`📡 [Synthesizer] Node Engagement: ${config.name}`);
        
        // Context windowing to prevent node-level context crashes
        let effectivePrompt = prompt;
        if (prompt.length > config.contextCharLimit) {
          if (prompt.includes('<AUTHORITATIVE_VAULT>')) {
             const parts = prompt.split('</AUTHORITATIVE_VAULT>');
             const vaultPart = parts[0].substring(0, config.contextCharLimit - 3000);
             effectivePrompt = `${vaultPart}\n</AUTHORITATIVE_VAULT>\n${parts[1] || ''}`;
          } else {
             effectivePrompt = prompt.substring(0, config.contextCharLimit);
          }
        }

        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const timeout = config.name === 'gemini' ? 95000 : 25000; // Fast-fail for non-Gemini nodes
        
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
        
        // DETERMINISTIC FAILOVER CRITERIA
        const isSkipableError = 
          errorMsg.includes('429') || 
          errorMsg.includes('quota') || 
          errorMsg.includes('404') || // Model not found on this node
          errorMsg.includes('400') || // Bad request/Context size
          errorMsg.includes('500') || // Provider internal error
          errorMsg.includes('timeout') ||
          errorMsg.includes('failed to fetch');

        console.warn(`⚠️ [Node Fault] ${config.name}: ${e.message}`);
        
        lastError = e;
        
        // If the node is broken, hop to the next one immediately
        if (isSkipableError) {
          console.log(`🔄 [Orchestrator] Rerouting request to next available segment...`);
          continue;
        }
        
        // If it's a security/auth error (401), we throw it as it's a configuration issue
        if (errorMsg.includes('401')) throw e;

        // For all other unknown errors, attempt failover anyway for production resilience
        continue;
      }
    }
    
    throw lastError || new Error("NEURAL GRID EXHAUSTED: All nodes failed to process this pedagogical request.");
  });
}