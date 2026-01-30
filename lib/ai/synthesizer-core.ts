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
 * WORLD-CLASS SYNTHESIZER ORCHESTRATOR
 * Optimized for massive 185+ page document ingestion.
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
  
  // HEAVY TASK DETECTION: 185-page curriculum mapping trigger
  const isCurriculumMapping = prompt.includes('SINDH BIOLOGY 2024') || prompt.includes('MAP_REDUCE_TRIGGER');
  const isMassive = prompt.length > 90000;
  const isInternalTask = prompt.includes('[PARTIAL_MAP_CHUNK]') || prompt.includes('[REDUCE_PHASE_ACTIVE]');

  if ((isMassive || isCurriculumMapping) && !isInternalTask) {
    return await runCurriculumMapReduce(prompt, history, systemInstruction);
  }

  const executionTask = async () => {
    const currentProviders = getProvidersConfig();
    let targetProviders = [...currentProviders].filter(p => p.enabled);
    
    // Sort providers by reasoning capability for complex tasks
    const reasoningOrder = ['gemini', 'openai', 'deepseek', 'groq'];
    targetProviders.sort((a, b) => reasoningOrder.indexOf(a.name) - reasoningOrder.indexOf(b.name));

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
          effectivePrompt = prompt.substring(0, config.contextCharLimit);
        }

        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        // Increased timeout for Reduce phase
        const timeout = isInternalTask && prompt.includes('[REDUCE_PHASE_ACTIVE]') ? 180000 : 120000;
        
        const response = await Promise.race([
          (callFunction as any)(effectivePrompt, history, systemInstruction, hasDocs, docParts),
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
        console.warn(`⚠️ [Node Fault] ${config.name}: ${e.message}`);
        lastError = e;
        continue; 
      }
    }
    throw lastError || new Error("GRID_EXHAUSTED: Multi-provider synthesis failed.");
  };

  if (bypassQueue) return await executionTask();
  return await requestQueue.add<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }>(executionTask);
}

async function runCurriculumMapReduce(fullText: string, history: any[], masterSystem: string) {
  console.log(`🚀 [Map-Reduce] Distributed Ingestion Engaged: 185-page curriculum...`);
  
  // Reduced chunk size for faster parallel processing of massive text
  const CHUNK_SIZE = 80000;
  const OVERLAP = 4000;
  const chunks: string[] = [];
  for (let i = 0; i < fullText.length; i += (CHUNK_SIZE - OVERLAP)) {
    chunks.push(fullText.substring(i, i + CHUNK_SIZE));
  }

  // MAP PHASE: Use fast nodes for raw extraction
  const availableExtractionProviders = ['groq', 'cerebras', 'sambanova', 'deepseek', 'openai']
    .filter(name => getProvidersConfig().find(p => p.name === name)?.enabled);

  console.log(`📡 [Map Phase] Deploying ${chunks.length} extraction nodes...`);
  
  const mapPromises = chunks.map((chunk, idx) => {
    const provider = availableExtractionProviders[idx % availableExtractionProviders.length] || 'gemini';
    const mapPrompt = `[PARTIAL_MAP_CHUNK ${idx + 1}/${chunks.length}] 
    Analyze this chunk of Biology Sindh 2024. Extract ALL SLO codes and descriptions verbatim.
    FORMAT: JSON array of objects {code, description}.
    TEXT: ${chunk}`;

    return synthesize(mapPrompt, [], false, [], provider, "You are a curriculum data extractor. Return valid JSON only.", true);
  });

  const mapResults = await Promise.all(mapPromises);

  // REDUCE PHASE: Final synthesis using top-tier model
  console.log(`🧠 [Reduce Phase] Finalizing Master Hierarchy via Gemini Pro...`);
  const aggregatedResults = mapResults.map(r => r.text).join('\n---\n');
  
  const reducePrompt = `[REDUCE_PHASE_ACTIVE] You are the MASTER SYNTHESIZER.
  Merge ${mapResults.length} partial JSON extracts into one authoritative Sindh Biology 2024 hierarchy.
  DEDUPLICATE SLOs. Return Master Markdown + Master JSON SLO Map.
  
  EXTRACTS:
  ${aggregatedResults}`;

  return await synthesize(reducePrompt, history, false, [], 'gemini', masterSystem, true);
}