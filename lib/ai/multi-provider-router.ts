
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
 * Adaptive timeout wrapper to prevent a single node from hanging the entire gateway.
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
 * Gemini acts as the visual/text extraction layer for complex curriculum files.
 * This result is shared with other reasoning models like DeepSeek.
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
    // Extraction is a heavy task, we give it a 20s window.
    const extractedText = await withTimeout<string>(
      callGemini(extractionPrompt, [], "SYSTEM: RAW_TEXT_EXTRACTOR", true, docPart),
      20000,
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
    console.warn("[Neural Chain] Extraction failed, using existing metadata for grounding.", e);
  }

  return documents;
}

function selectOptimalProviderOrder(hasDocs: boolean, hasDocPart: boolean): string[] {
  // If we have a raw file part, Gemini MUST be tried first as it's the multimodal specialist.
  if (hasDocPart) return ['gemini', 'deepseek', 'sambanova', 'hyperbolic'];
  if (hasDocs) return ['deepseek', 'sambanova', 'gemini', 'groq'];
  return ['cerebras', 'hyperbolic', 'groq', 'deepseek', 'gemini'];
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

export function getProviderStatus() {
  return PROVIDERS.map(config => ({
    name: config.name,
    enabled: config.enabled,
    limits: { rpm: config.rpm, rpd: config.rpd },
    remaining: rateLimiter.getRemainingRequests(config.name, config)
  }));
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
  
  // 1. NEURAL PRE-PROCESSING: Use Gemini to extract text from files for other models.
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
    
    const optimalOrder = selectOptimalProviderOrder(hasDocs, !!docPart);
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

    // Vercel/Gateway limit is 60s. We aim to return within 55s.
    const GLOBAL_MAX_DURATION = 55000;

    for (const config of sortedProviders) {
      const elapsed = Date.now() - startTime;
      if (elapsed > GLOBAL_MAX_DURATION) break;

      if (!rateLimiter.canMakeRequest(config.name, config)) continue;

      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        
        const callArgs = [finalPrompt, history, finalInstruction, hasDocs];
        if (config.name === 'gemini') {
          callArgs.push(docPart);
        }
        
        // Adaptive timeout: give more time to the first provider, less to fallbacks
        const nodeTimeout = Math.min(25000, GLOBAL_MAX_DURATION - (Date.now() - startTime));

        let response = await withTimeout<string>(
          (callFunction as any)(...callArgs),
          nodeTimeout,
          config.name
        );
        
        // Verify grounding success
        if (hasDocs && wasDocumentsIgnored(response)) {
          console.warn(`[Node: ${config.name}] Grounding failure. Retrying with explicit boost...`);
          const strictPrompt = `🔴 CRITICAL: YOU MUST USE THE DATA PROVIDED IN THE ASSET VAULT. 🔴\n\n${finalPrompt}`;
          response = await withTimeout<string>(
            (callFunction as any)(strictPrompt, history, `STRICT_GROUNDING_ACTIVE.`, hasDocs),
            nodeTimeout,
            `${config.name}-retry`
          );
        }

        rateLimiter.trackRequest(config.name);
        responseCache.set(prompt, history, response, config.name);
        return { text: response, provider: config.name };
      } catch (e: any) {
        console.error(`[Synthesis Grid] Node ${config.name} failed:`, e.message);
        lastError = e;
      }
    }
    
    throw lastError || new Error("The synthesis grid is currently disconnected or exhausted.");
  });
}
