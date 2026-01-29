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
 * NEURAL PROVIDER GRID (v65.0)
 * Tier 1: Gemini 3 Pro, GPT-4o, DeepSeek R1 (Reasoning/Synthesis)
 * Tier 2: Groq, Cerebras, SambaNova (High-Speed Extraction)
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

/**
 * SWARM SYNTHESIZER
 * Orchestrates multi-model collaboration for massive documents.
 */
export async function synthesize(
  prompt: string,
  history: any[],
  hasDocs: boolean,
  docParts: any[] = [],
  preferredProvider?: string,
  systemInstruction: string = DEFAULT_MASTER_PROMPT
): Promise<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }> {
  
  // HEAVY TASK DETECTION: Trigger Swarm Processing if payload is massive
  const isMassive = prompt.length > 150000;
  if (isMassive && !prompt.includes('[PARTIAL_CHUNK]')) {
    return swarmProcess(prompt, history, systemInstruction);
  }

  return await requestQueue.add<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }>(async () => {
    const currentProviders = getProvidersConfig();
    const isMappingTask = prompt.includes('PEDAGOGICAL MARKDOWN') || prompt.includes('SLO');
    
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
        let effectivePrompt = prompt;
        if (prompt.length > config.contextCharLimit) {
          console.warn(`📏 [Synthesizer] Truncating prompt for ${config.name} (${prompt.length} -> ${config.contextCharLimit})`);
          effectivePrompt = prompt.substring(0, config.contextCharLimit);
        }

        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const response = await Promise.race([
          (callFunction as any)(effectivePrompt, history, systemInstruction, hasDocs, docParts),
          new Promise((_, reject) => setTimeout(() => reject(new Error('NODE_TIMEOUT')), 115000))
        ]);

        if (typeof response === 'string') return { text: response, provider: config.name };
        return { 
          text: response.text || "Synthesis complete.", 
          provider: config.name, 
          groundingMetadata: response.groundingMetadata,
          imageUrl: response.imageUrl
        };
      } catch (e: any) { 
        console.warn(`⚠️ [Node Fault] ${config.name}: ${e.message}`);
        lastError = e;
        continue; 
      }
    }
    
    throw lastError || new Error("GRID_EXHAUSTED: All nodes failed.");
  });
}

/**
 * RECURSIVE SWARM ORCHESTRATOR
 * Splits 185+ page tasks into manageable parallel inference nodes.
 */
async function swarmProcess(fullPrompt: string, history: any[], systemInstruction: string) {
  console.log(`🚀 [Swarm] Initializing Multi-Model Map-Reduce...`);
  
  const CHUNK_SIZE = 80000;
  const chunks: string[] = [];
  for (let i = 0; i < fullPrompt.length; i += CHUNK_SIZE) {
    chunks.push(fullPrompt.substring(i, i + CHUNK_SIZE));
  }

  // 1. MAP PHASE: Parallel extraction using the fastest available grid nodes
  const partialResults = await Promise.all(chunks.map((chunk, idx) => {
    const chunkPrompt = `[PARTIAL_CHUNK ${idx + 1}/${chunks.length}] Analyze this segment of the 2024 curriculum. 
    EXTRACT: All SLO codes and their verbatim text.
    TEXT: ${chunk}`;
    return synthesize(chunkPrompt, [], false, [], undefined, "You are a data extraction node. Return only structured data.");
  }));

  // 2. REDUCE PHASE: Master synthesis using a high-reasoning model
  console.log(`🧠 [Swarm] Synthesis Node Convergence Initiated...`);
  const aggregateData = partialResults.map(r => r.text).join('\n---\n');
  const masterPrompt = `The following is a collection of extracted curriculum segments from a 185-page document.
  
  TASK: Merge these into one authoritative, hierarchical SINDH BIOLOGY 2024 JSON map.
  SCHEMA: Must include metadata, slos, and slo_map.
  
  PARTIAL EXTRACTS:
  ${aggregateData}`;

  return synthesize(masterPrompt, history, false, [], 'gemini', systemInstruction);
}