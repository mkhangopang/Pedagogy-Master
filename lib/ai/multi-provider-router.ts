
import { SupabaseClient } from '@supabase/supabase-js';
import { callGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { callGemini } from './providers/gemini';
import { callDeepSeek } from './providers/deepseek';
import { callCerebras } from './providers/cerebras';
import { callSambaNova } from './providers/sambanova';
import { callHyperbolic } from './providers/hyperbolic';
import { rateLimiter, ProviderConfig } from './rate-limiter';
import { responseCache } from './response-cache';
import { requestQueue } from './request-queue';
import { SYSTEM_PERSONALITY, RESPONSE_LENGTH_GUIDELINES } from '../config/ai-personality';
import { analyzeUserQuery, QueryAnalysis } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { fetchAndIndexDocuments, buildDocumentAwarePrompt } from '../documents/document-processor-runtime';
import { getCachedOrGenerate } from './intelligent-cache';
import { generateLearningPath } from './learning-path';

const PROVIDERS: ProviderConfig[] = [
  { name: 'gemini', rpm: 15, rpd: 1500, enabled: !!process.env.API_KEY },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY },
  { name: 'sambanova', rpm: 100, rpd: 999999, enabled: !!process.env.SAMBANOVA_API_KEY },
  { name: 'cerebras', rpm: 120, rpd: 999999, enabled: !!process.env.CEREBRAS_API_KEY },
  { name: 'hyperbolic', rpm: 50, rpd: 999999, enabled: !!process.env.HYPERBOLIC_API_KEY },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY },
  { name: 'openrouter', rpm: 50, rpd: 200, enabled: !!process.env.OPENROUTER_API_KEY },
];

const PROVIDER_FUNCTIONS = {
  deepseek: callDeepSeek,
  cerebras: callCerebras,
  sambanova: callSambaNova,
  hyperbolic: callHyperbolic,
  groq: callGroq,
  openrouter: callOpenRouter,
  gemini: callGemini,
};

const MODEL_SPECIALIZATION: Record<string, string> = {
  'lookup': 'gemini', // Database first handled in router logic, but gemini is best for fallback
  'teaching': 'deepseek', // Best for practical classroom strategies
  'lesson_plan': 'gemini', // Most reliable for complex structured grounding
  'assessment': 'cerebras', // High speed for question sets
  'differentiation': 'sambanova', // Excellent reasoning for tiered supports
  'general': 'groq', // Low latency general responses
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, providerName: string): Promise<T> {
  let timeoutHandle: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`Node ${providerName} timeout`)), timeoutMs);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  clearTimeout(timeoutHandle!);
  return result;
}

/**
 * CORE SYNTHESIS LOOP
 * Executes the provider fallback logic with prioritization.
 */
export async function synthesize(
  prompt: string,
  history: any[],
  hasDocs: boolean,
  docPart?: any,
  preferredProvider?: string
): Promise<{ text: string; provider: string }> {
  return await requestQueue.add<{ text: string; provider: string }>(async () => {
    // Determine priority list
    const sortedProviders = [...PROVIDERS]
      .filter(p => p.enabled)
      .sort((a, b) => {
        // 1. Explicitly preferred (Specialization)
        if (a.name === preferredProvider) return -1;
        if (b.name === preferredProvider) return 1;

        // 2. Multimodal Capability (Gemini priority for files)
        if (docPart) {
          if (a.name === 'gemini') return -1;
          if (b.name === 'gemini') return 1;
        }

        // 3. Grounding Accuracy
        if (hasDocs) {
          if (a.name === 'gemini') return -1;
          if (b.name === 'gemini') return 1;
          if (a.name === 'deepseek') return -1;
          if (b.name === 'deepseek') return 1;
        }
        
        return 0;
      });

    for (const config of sortedProviders) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;
      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const response = await withTimeout<string>(
          (callFunction as any)(prompt, history, SYSTEM_PERSONALITY, hasDocs, docPart),
          35000,
          config.name
        );
        rateLimiter.trackRequest(config.name);
        return { text: response, provider: config.name };
      } catch (e) { 
        console.error(`Synthesis Node Failure: ${config.name}`, e); 
      }
    }
    throw new Error("Neural Grid Exhausted: All available synthesis nodes failed.");
  });
}

function buildInstantSLOResponse(sloData: any): string {
  return `
**SLO ${sloData.slo_code}:**
"${sloData.slo_full_text}"

**Pedagogical Context:**
This objective maps to the **${sloData.bloom_level}** cognitive level (${sloData.cognitive_complexity || 'Standard'} complexity).

**Core Concepts:**
${sloData.keywords?.slice(0, 5).map((k: string) => `- ${k}`).join('\n') || '- Refer to curriculum documentation.'}

${sloData.prerequisite_concepts && sloData.prerequisite_concepts.length > 0 ? `
**Prerequisites:**
${sloData.prerequisite_concepts.map((p: string) => `- ${p}`).join('\n')}
` : ''}

${sloData.common_misconceptions && sloData.common_misconceptions.length > 0 ? `
**Misconception Alerts:**
${sloData.common_misconceptions.map((m: string) => `- ${m}`).join('\n')}
` : ''}

*Options: [Generate Lesson Plan] | [Strategies] | [Quiz]*
`;
}

function buildEnhancedContextWithSLOData(sloData: any): string {
  return `
--- HIGH-PRECISION SLO METADATA FOUND ---
CODE: ${sloData.slo_code}
CONTENT: ${sloData.slo_full_text}
BLOOM LEVEL: ${sloData.bloom_level}
COMPLEXITY: ${sloData.cognitive_complexity || 'Medium'}
TEACHING STRATEGIES: ${sloData.teaching_strategies?.join(', ') || 'N/A'}
ASSESSMENT IDEAS: ${sloData.assessment_ideas?.join(', ') || 'N/A'}
PREREQUISITES: ${sloData.prerequisite_concepts?.join(', ') || 'N/A'}
MISCONCEPTIONS: ${sloData.common_misconceptions?.join(', ') || 'N/A'}
--- END STRUCTURED DATA ---
`;
}

export async function generateAIResponse(
  userPrompt: string,
  history: any[],
  userId: string,
  supabase: SupabaseClient,
  adaptiveContext?: string,
  docPart?: any,
  toolType?: string
): Promise<{ text: string; provider: string }> {
  // 1. Transient Cache Check
  const cached = responseCache.get(userPrompt, history);
  if (cached) return { text: cached, provider: 'cache' };

  // 2. Intelligence Analysis
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const preferredProvider = MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'groq';

  // 3. High-Precision SLO Handler
  let structuredContext = '';
  if (queryAnalysis.extractedSLO) {
    const { data: sloData } = await supabase
      .from('slo_database')
      .select('*, documents!inner(user_id)')
      .eq('slo_code', queryAnalysis.extractedSLO)
      .eq('documents.user_id', userId)
      .maybeSingle();

    if (sloData) {
      // 3a. Instant Lookup Logic
      if (queryAnalysis.queryType === 'lookup') {
        const instantResponse = buildInstantSLOResponse(sloData);
        responseCache.set(userPrompt, history, instantResponse, 'database-cache');
        return { text: instantResponse, provider: 'database-cache' };
      }

      // 3b. Intelligent Pedagogical Cache
      const cacheableTypes = ['lesson_plan', 'teaching', 'assessment'];
      if (cacheableTypes.includes(queryAnalysis.queryType)) {
        const cacheType = queryAnalysis.queryType === 'teaching' ? 'teaching_strategies' : queryAnalysis.queryType;
        try {
          const cachedContent = await getCachedOrGenerate(queryAnalysis.extractedSLO, cacheType as any, userId);
          return { text: cachedContent, provider: 'intelligent-cache' };
        } catch (e) {
          console.warn("Artifact Cache miss, synthesizing fresh...");
        }
      }
      
      // 3c. Inject high-precision grounding
      structuredContext = buildEnhancedContextWithSLOData(sloData);
    }
  }

  // 4. Special Tool Handlers
  if (toolType === 'learning-path' && queryAnalysis.extractedSLO) {
    const path = await generateLearningPath(queryAnalysis.extractedSLO, userId);
    const pathText = `**Prerequisite Learning Chain for ${queryAnalysis.extractedSLO}:**\n\n${path.map((code, i) => `${i + 1}. **${code}**`).join(' → ')}\n\n*Mastery of preceding concepts is recommended for instructional success.*`;
    return { text: pathText, provider: 'curriculum-graph' };
  }

  // 5. Runtime Grounding (RAG)
  const documentIndex = await fetchAndIndexDocuments(userId);
  const hasDocs = documentIndex.documentCount > 0 || !!structuredContext || !!docPart;
  
  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  const { prompt: enhancedPrompt } = buildDocumentAwarePrompt(userPrompt, documentIndex);

  let documentContext = structuredContext;
  if (documentIndex.documentCount > 0) {
    documentContext += documentIndex.documents.map(d => `\nSOURCE: ${d.filename}\n${d.content}`).join('\n');
  }

  const finalPrompt = `
${SYSTEM_PERSONALITY}
${hasDocs ? `🔴 ASSET_VAULT ACTIVE\n${documentContext}` : '⚠️ GENERAL MODE - NO LOCAL CONTEXT'}
---
Teacher Query: ${enhancedPrompt}
---
Instruction: Ground your response strictly in the provided ASSET_VAULT if applicable.
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}
`;

  const result = await synthesize(finalPrompt, history, hasDocs, docPart, preferredProvider);
  responseCache.set(userPrompt, history, result.text, result.provider);
  return result;
}

export function getProviderStatus() {
  return PROVIDERS.map(config => ({
    name: config.name,
    enabled: config.enabled,
    limits: { rpm: config.rpm, rpd: config.rpd },
    remaining: rateLimiter.getRemainingRequests(config.name, config)
  }));
}
