
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
import { DEFAULT_MASTER_PROMPT, NUCLEAR_GROUNDING_DIRECTIVE, STRICT_SYSTEM_INSTRUCTION, APP_NAME } from '../../constants';

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

/**
 * Executes a function with a specific timeout to prevent blocking the whole gateway.
 */
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

/**
 * NEURAL EXTRACTION CHAIN:
 * Gemini processes the binary file to extract text for other providers.
 * This is now non-blocking for the global timeout.
 */
async function ensureDocumentText(
  documents: DocumentContent[], 
  supabase: SupabaseClient, 
  docPart: any
): Promise<DocumentContent[]> {
  const needsExtraction = documents.filter(d => (!d.extractedText || d.extractedText.length < 50) && d.mimeType.includes('pdf'));
  
  if (needsExtraction.length === 0 || !docPart) return documents;

  try {
    const extractionPrompt = "MANDATORY: Extract the full raw text from this document. Respond ONLY with the extracted text. No commentary.";
    // Extraction timeout is aggressive (12s) to avoid dragging down the response.
    const extractedText = await withTimeout<string>(
      callGemini(extractionPrompt, [], "SYSTEM: RAW_TEXT_EXTRACTOR", true, docPart),
      12000,
      'gemini-extractor'
    );
    
    if (extractedText && extractedText.length > 50) {
      await supabase.from('documents').update({ 
        extracted_text: extractedText,
        word_count: extractedText.split(/\s+/).length
      }).eq('id', needsExtraction[0].id);

      needsExtraction[0].extractedText = extractedText;
    }
  } catch (e) {
    console.warn("[Neural Chain] Extraction node busy or failed. Falling back to metadata-only grounding.");
  }

  return documents;
}

function selectOptimalProviderOrder(hasDocPart: boolean): string[] {
  // If we have a direct file part, Gemini MUST be tried first.
  if (hasDocPart) return ['gemini', 'deepseek', 'sambanova', 'hyperbolic'];
  return ['deepseek', 'sambanova', 'cerebras', 'hyperbolic', 'groq'];
}

function buildNuclearPrompt(
  documentContext: string,
  history: any[],
  userPrompt: string,
  documentFilenames: string[]
): string {
  const historyText = history
    .slice(-3)
    .map(m => `${m.role === 'user' ? 'Teacher' : 'AI'}: ${m.content}`)
    .join('\n\n');

  return `
${NUCLEAR_GROUNDING_DIRECTIVE.replace('FILENAME', documentFilenames.join(', '))}

<ASSET_VAULT>
ACTIVE_CURRICULUM_FILES: ${documentFilenames.join(', ')}

${documentContext}
</ASSET_VAULT>

---
[HISTORY]
${historyText}

[TEACHER_REQUEST]
${userPrompt}

[RESPONSE_PROTOCOL]
Synthesize based EXCLUSIVELY on the <ASSET_VAULT> provided above.

NEURAL_SYNTHESIS:`;
}

function wasDocumentsIgnored(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("don't have access") || 
    lower.includes("cannot read the documents") ||
    lower.includes("no documents were provided")
  );
}

export async function generateAIResponse(
  prompt: string,
  history: any[],
  userId: string,
  supabase: SupabaseClient,
  adaptiveContext?: string,
  docPart?: any,
  toolType?: string
): Promise<{ text: string; provider: string }> {
  const cached = responseCache.get(prompt, history);
  if (cached) return { text: cached, provider: 'cache' };

  let documents = await getSelectedDocumentsWithContent(supabase, userId);
  
  // Chain interaction: Use Gemini to prepare the ground for reasoning models
  if (documents.length > 0 && docPart) {
    documents = await ensureDocumentText(documents, supabase, docPart);
  }

  const docNames = documents.map(d => d.filename);
  const hasDocs = documents.length > 0;
  const docContext = buildDocumentContextString(documents);
  
  const dbSystemPrompt = await (async () => {
    try {
      const { data } = await supabase
        .from('neural_brain')
        .select('master_prompt')
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();
      return data?.master_prompt || DEFAULT_MASTER_PROMPT;
    } catch (e) {
      return DEFAULT_MASTER_PROMPT;
    }
  })();

  const baseInstruction = `${dbSystemPrompt}\n${adaptiveContext || ''}\nRESTRICTION: 1. and 1.1. for headers. NO BOLD HEADINGS. BE CONCISE.`;

  let finalPrompt = prompt;
  let finalInstruction = baseInstruction;

  if (hasDocs) {
    finalPrompt = buildNuclearPrompt(docContext, history, prompt, docNames);
    finalInstruction = STRICT_SYSTEM_INSTRUCTION;
  }

  return await requestQueue.add<{ text: string; provider: string }>(async () => {
    let lastError: Error | null = null;
    const startTime = Date.now();
    
    // Vercel nodejs runtime maxDuration is 60s. We aim to finish by 55s.
    const GLOBAL_MAX_MS = 55000;
    
    const optimalOrder = selectOptimalProviderOrder(!!docPart);
    const sortedProviders = [...PROVIDERS]
      .filter(p => p.enabled)
      .sort((a, b) => {
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
        console.log(`[Neural Router] Attempting synthesis with node: ${config.name}`);
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        
        const callArgs = [finalPrompt, history, finalInstruction, hasDocs];
        if (config.name === 'gemini') {
          callArgs.push(docPart);
        }
        
        // Per-provider timeout to allow fallback if one node is slow
        // We give each node 15s to 20s.
        const providerTimeout = Math.min(20000, GLOBAL_MAX_MS - (Date.now() - startTime));

        let response = await withTimeout<string>(
          (callFunction as any)(...callArgs),
          providerTimeout,
          config.name
        );
        
        if (hasDocs && wasDocumentsIgnored(response)) {
          console.warn(`[Node: ${config.name}] Grounding failure detected. Attempting strict retry...`);
          const strictPrompt = `🔴 STICK TO THE ASSET_VAULT 🔴\n\n${finalPrompt}`;
          response = await withTimeout<string>(
            (callFunction as any)(strictPrompt, history, `STRICT_GROUNDING_ONLY.`, hasDocs),
            providerTimeout,
            `${config.name}-retry`
          );
        }

        rateLimiter.trackRequest(config.name);
        responseCache.set(prompt, history, response, config.name);
        return { text: response, provider: config.name };
      } catch (e: any) {
        console.error(`[Neural Router] Node ${config.name} failure:`, e.message);
        lastError = e;
      }
    }
    
    throw lastError || new Error("The synthesis grid is currently disconnected or exhausted. Try a shorter request.");
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
