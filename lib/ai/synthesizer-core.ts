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
 * Detects massive payloads and automatically triggers a Map-Reduce pipeline.
 */
export async function synthesize(
  prompt: string,
  history: any[],
  hasDocs: boolean,
  docParts: any[] = [],
  preferredProvider?: string,
  systemInstruction: string = DEFAULT_MASTER_PROMPT
): Promise<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }> {
  
  // HEAVY TASK DETECTION: 185-page curriculum mapping trigger
  const isCurriculumMapping = prompt.includes('SINDH BIOLOGY 2024') || prompt.includes('MAP_REDUCE_TRIGGER');
  const isMassive = prompt.length > 120000;

  if ((isMassive || isCurriculumMapping) && !prompt.includes('[PARTIAL_MAP_CHUNK]')) {
    return await runCurriculumMapReduce(prompt, history, systemInstruction);
  }

  return await requestQueue.add<{ text: string; provider: string; groundingMetadata?: any; imageUrl?: string }>(async () => {
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
  });
}

/**
 * MAP-REDUCE PIPELINE FOR SINDH BIOLOGY 2024
 * Parallelizes extraction across the provider grid.
 */
async function runCurriculumMapReduce(fullText: string, history: any[], masterSystem: string) {
  console.log(`🚀 [Map-Reduce] Initializing Distributed Ingestion for 185-page asset...`);
  
  // 1. CHUNKING (Overlap logic to prevent SLO truncation)
  const CHUNK_SIZE = 90000;
  const OVERLAP = 3000;
  const chunks: string[] = [];
  for (let i = 0; i < fullText.length; i += (CHUNK_SIZE - OVERLAP)) {
    chunks.push(fullText.substring(i, i + CHUNK_SIZE));
  }

  // 2. MAP PHASE: Distribute extraction to fast nodes (Groq, Cerebras, SambaNova)
  const availableExtractionProviders = ['groq', 'cerebras', 'sambanova', 'deepseek', 'openai']
    .filter(name => getProvidersConfig().find(p => p.name === name)?.enabled);

  console.log(`📡 [Map Phase] Deploying ${chunks.length} extraction nodes across grid...`);
  
  const mapPromises = chunks.map((chunk, idx) => {
    const provider = availableExtractionProviders[idx % availableExtractionProviders.length] || 'gemini';
    const mapPrompt = `[PARTIAL_MAP_CHUNK ${idx + 1}/${chunks.length}] 
    Analyze this CHUNK of the Biology Sindh 2024 curriculum.
    EXTRACT: ALL SLO codes (B-grade-domain-number), verbatim descriptions, and benchmarks.
    FORMAT: JSON object with 'domains', 'slos', and 'cross_references'.
    TEXT: ${chunk}`;

    return synthesize(mapPrompt, [], false, [], provider, "You are a curriculum data extractor. Return valid JSON only.");
  });

  const mapResults = await Promise.all(mapPromises);

  // 3. REDUCE PHASE: Master Synthesis using Gemini 3 Pro
  console.log(`🧠 [Reduce Phase] Synthesizing master curriculum hierarchy via Gemini Pro...`);
  const aggregatedResults = mapResults.map(r => r.text).join('\n---\n');
  
  const reducePrompt = `You are the MASTER SYNTHESIZER for the Sindh Biology 2024 Project.
  You have received ${mapResults.length} partial JSON extractions.
  
  GOALS:
  1. MERGE all partial structures into one authoritative master hierarchy.
  2. DEDUPLICATE any SLOs caught in chunk overlaps.
  3. VALIDATE sequential numbering for Grades IX-XII and Domains A-S + X.
  4. ASSIGN Grade levels correctly based on code (e.g., B-09-A-01 is Grade 9).
  
  OUTPUT: A single, comprehensive JSON payload containing:
  - curriculum_metadata (title, total_slos, grades)
  - domain_summary (count per domain)
  - complete_hierarchy (Domain -> Standard -> Grade -> Benchmark -> SLO)
  - keyword_index
  
  PARTIAL EXTRACTS:
  ${aggregatedResults}`;

  return await synthesize(reducePrompt, history, false, [], 'gemini', masterSystem);
}