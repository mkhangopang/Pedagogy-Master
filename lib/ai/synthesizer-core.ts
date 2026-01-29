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
 * Optimized for massive 185+ page document ingestion via distributed Map-Reduce.
 */
export async function synthesize(
  prompt: string,
  history: any[],
  hasDocs: boolean,
  docParts: any[] = [],
  preferredProvider?: string,
  systemInstruction: string = DEFAULT_MASTER_PROMPT,
  bypassQueue: boolean = false // Used for internal Map-Reduce sub-tasks to prevent deadlocks
): Promise<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }> {
  
  // HEAVY TASK DETECTION
  const isCurriculumMapping = prompt.includes('SINDH BIOLOGY 2024') || prompt.includes('MAP_REDUCE_TRIGGER');
  const isMassive = prompt.length > 120000;
  // Markers to prevent infinite recursion during Map-Reduce segments
  const isAlreadyFragmented = prompt.includes('[PARTIAL_MAP_CHUNK]') || prompt.includes('[REDUCE_PHASE_ACTIVE]');

  if ((isMassive || isCurriculumMapping) && !isAlreadyFragmented) {
    return await runCurriculumMapReduce(prompt, history, systemInstruction);
  }

  const executionTask = async () => {
    const currentProviders = getProvidersConfig();
    let targetProviders = [...currentProviders].filter(p => p.enabled);
    
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
    throw lastError || new Error("GRID_EXHAUSTED: Multi-provider synthesis failed.");
  };

  // Logic: Internal sub-tasks bypass the queue to prevent occupancy-based deadlocks
  if (bypassQueue) {
    return await executionTask();
  }

  return await requestQueue.add<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }>(executionTask);
}

async function runCurriculumMapReduce(fullText: string, history: any[], masterSystem: string) {
  console.log(`🚀 [Map-Reduce] Distributed Ingestion Engaged for 185-page asset...`);
  
  // Larger chunk sizes to reduce total request count
  const CHUNK_SIZE = 120000;
  const OVERLAP = 5000;
  const chunks: string[] = [];
  for (let i = 0; i < fullText.length; i += (CHUNK_SIZE - OVERLAP)) {
    chunks.push(fullText.substring(i, i + CHUNK_SIZE));
  }

  // MAP PHASE: Use high-speed providers (Groq/Cerebras) for fragment extraction
  const availableExtractionProviders = ['groq', 'cerebras', 'sambanova', 'deepseek']
    .filter(name => getProvidersConfig().find(p => p.name === name)?.enabled);

  console.log(`📡 [Map Phase] Processing ${chunks.length} segments in parallel...`);
  
  const mapPromises = chunks.map((chunk, idx) => {
    const provider = availableExtractionProviders[idx % availableExtractionProviders.length] || 'gemini';
    const mapPrompt = `[PARTIAL_MAP_CHUNK ${idx + 1}/${chunks.length}] 
    Analyze this CHUNK of the curriculum.
    EXTRACT: SLO codes (B-grade-domain-number), descriptions, and benchmarks.
    FORMAT: JSON object.
    TEXT: ${chunk}`;

    // bypassQueue is TRUE to prevent deadlock with the parent task
    return synthesize(mapPrompt, [], false, [], provider, "You are a curriculum data extractor. Return JSON.", true);
  });

  const mapResults = await Promise.all(mapPromises);

  // REDUCE PHASE: Final high-reasoning synthesis
  console.log(`🧠 [Reduce Phase] Finalizing master curriculum via Gemini Pro...`);
  const aggregatedResults = mapResults.map(r => r.text).join('\n---\n');
  
  const reducePrompt = `[REDUCE_PHASE_ACTIVE] You are the MASTER SYNTHESIZER.
  MERGE all partial extracts into one authoritative Sindh Biology 2024 JSON hierarchy.
  
  EXTRACTS:
  ${aggregatedResults}`;

  return await synthesize(reducePrompt, history, false, [], 'gemini', masterSystem, true);
}
