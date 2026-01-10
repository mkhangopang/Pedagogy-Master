
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
import { getSelectedDocumentsWithContent, buildDocumentContextString, DocumentContent } from '../documents/document-fetcher';
import { DEFAULT_MASTER_PROMPT, NUCLEAR_GROUNDING_DIRECTIVE, APP_NAME } from '../../constants';
import { enforceDocumentMode, validateDocumentResponse, SYSTEM_PERSONALITY, RESPONSE_LENGTH_GUIDELINES, APP_CONFIG } from '../config/ai-personality';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { fetchAndIndexDocuments, buildDocumentAwarePrompt } from '../documents/document-processor-runtime';

const PROVIDERS: ProviderConfig[] = [
  { name: 'gemini', rpm: 15, rpd: 1500, enabled: !!(process.env.API_KEY || process.env.GEMINI_API_KEY) },
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, providerName: string): Promise<T> {
  let timeoutHandle: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Node ${providerName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (err) {
    clearTimeout(timeoutHandle!);
    throw err;
  }
}

function selectOptimalProviderOrder(hasDocPart: boolean): string[] {
  if (hasDocPart) return ['gemini', 'deepseek', 'sambanova', 'hyperbolic'];
  return ['deepseek', 'sambanova', 'cerebras', 'hyperbolic', 'groq'];
}

function wasDocumentsIgnored(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("don't have access") || 
    lower.includes("cannot read the documents") ||
    lower.includes("no documents were provided") ||
    lower.includes("based on general knowledge")
  );
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
  const cached = responseCache.get(userPrompt, history);
  if (cached) return { text: cached, provider: 'cache' };

  // 1. FETCH AND INDEX DOCUMENTS (MANDATORY RUNTIME GROUNDING)
  const documentIndex = await fetchAndIndexDocuments(userId);
  const hasDocs = documentIndex.documentCount > 0;
  const docFilenames = documentIndex.documents.map(d => d.filename);

  // 2. INTELLIGENT QUERY ANALYSIS
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  // 3. PRE-FETCH SLO INFO IF DETECTED
  const { prompt: enhancedPrompt } = buildDocumentAwarePrompt(userPrompt, documentIndex);

  // 4. ASSEMBLE CONTEXT
  let documentContext = '';
  for (const doc of documentIndex.documents) {
    documentContext += `\n━━━ DOCUMENT: ${doc.filename} ━━━\n${doc.content}\n`;
  }

  const dbSystemPrompt = await (async () => {
    try {
      const { data } = await supabase.from('neural_brain').select('master_prompt').eq('is_active', true).order('version', { ascending: false }).limit(1).single();
      return data?.master_prompt || DEFAULT_MASTER_PROMPT;
    } catch { return DEFAULT_MASTER_PROMPT; }
  })();

  const baseInstruction = `${dbSystemPrompt}\n${adaptiveContext || ''}\n${responseInstructions}\n${lengthGuideline}`;

  const finalPrompt = enforceDocumentMode(
    `${baseInstruction}\n\nTeacher: ${enhancedPrompt}`,
    documentContext,
    hasDocs
  );

  return await requestQueue.add<{ text: string; provider: string }>(async () => {
    let lastError: Error | null = null;
    const startTime = Date.now();
    const GLOBAL_MAX_MS = 55000;
    
    const optimalOrder = selectOptimalProviderOrder(!!docPart);
    const sortedProviders = [...PROVIDERS].filter(p => p.enabled).sort((a, b) => {
      const indexA = optimalOrder.indexOf(a.name);
      const indexB = optimalOrder.indexOf(b.name);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    for (const config of sortedProviders) {
      const elapsed = Date.now() - startTime;
      if (elapsed > GLOBAL_MAX_MS) break;

      if (!rateLimiter.canMakeRequest(config.name, config)) continue;

      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const providerTimeout = Math.min(20000, GLOBAL_MAX_MS - (Date.now() - startTime));

        let response = await withTimeout<string>(
          (callFunction as any)(finalPrompt, history, SYSTEM_PERSONALITY, hasDocs, docPart),
          providerTimeout,
          config.name
        );
        
        // Validation check
        if (hasDocs && APP_CONFIG.AUTO_RETRY_ON_GENERIC_RESPONSE) {
          const validation = validateDocumentResponse(response, docFilenames);
          if (!validation.isValid || wasDocumentsIgnored(response)) {
            console.warn(`[Node: ${config.name}] Generic response detected. Retrying...`);
            const strictPrompt = `🔴 STICK TO THE ASSET_VAULT. DO NOT ELABORATE. 🔴\n\n${finalPrompt}`;
            response = await withTimeout<string>(
              (callFunction as any)(strictPrompt, history, "STRICT_GROUNDING", hasDocs),
              providerTimeout,
              `${config.name}-retry`
            );
          }
        }

        rateLimiter.trackRequest(config.name);
        responseCache.set(userPrompt, history, response, config.name);
        return { text: response, provider: config.name };
      } catch (e: any) {
        lastError = e;
      }
    }
    
    throw lastError || new Error("The synthesis grid is currently disconnected or exhausted.");
  });
}

export function getProviderStatus() {
  return PROVIDERS.map(config => ({
    name: config.name,
    enabled: config.enabled,
    limits: { rpm: config.rpm, rpd: config.rpd },
    remaining: rateLimiter.getRemainingRequests(config.name, config)
  }));
}
