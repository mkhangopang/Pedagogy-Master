
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
  { name: 'deepseek', rpm: 58, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY },
  { name: 'cerebras', rpm: 118, rpd: 999999, enabled: !!process.env.CEREBRAS_API_KEY },
  { name: 'sambanova', rpm: 98, rpd: 999999, enabled: !!process.env.SAMBANOVA_API_KEY },
  { name: 'hyperbolic', rpm: 48, rpd: 999999, enabled: !!process.env.HYPERBOLIC_API_KEY },
  { name: 'groq', rpm: 28, rpd: 14000, enabled: !!process.env.GROQ_API_KEY },
  { name: 'openrouter', rpm: 50, rpd: 200, enabled: !!process.env.OPENROUTER_API_KEY },
  { 
    name: 'gemini', 
    rpm: 13, 
    rpd: 1400, 
    enabled: !!(process.env.API_KEY || process.env.GEMINI_API_KEY) 
  },
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
 * NEURAL EXTRACTION CHAIN:
 * If a document has no text (PDF/Image), use Gemini to extract it so other models can see it.
 */
async function ensureDocumentText(
  documents: DocumentContent[], 
  supabase: SupabaseClient, 
  docPart: any
): Promise<DocumentContent[]> {
  const needsExtraction = documents.filter(d => (!d.extractedText || d.extractedText.length < 100) && d.mimeType.includes('pdf'));
  
  if (needsExtraction.length === 0 || !docPart) return documents;

  console.log(`[Neural Chain] Triggering Gemini text extraction for: ${needsExtraction[0].filename}`);
  
  try {
    // Use Gemini Flash for ultra-fast extraction
    const extractionPrompt = "MANDATORY: Extract the full raw text from this curriculum document. Do not summarize. Just output the raw text content exactly as it appears. If it is a scan, use OCR.";
    const extractedText = await callGemini(extractionPrompt, [], "SYSTEM: RAW_TEXT_EXTRACTOR", true, docPart);
    
    if (extractedText && extractedText.length > 100) {
      // Update Supabase so this is cached permanently
      const docId = needsExtraction[0].id;
      await supabase.from('documents').update({ 
        extracted_text: extractedText,
        word_count: extractedText.split(/\s+/).length
      }).eq('id', docId);

      // Update local object for the current request
      needsExtraction[0].extractedText = extractedText;
    }
  } catch (e) {
    console.error("[Neural Chain] Extraction failed:", e);
  }

  return documents;
}

function selectOptimalProviderOrder(hasDocuments: boolean, promptLength: number): string[] {
  if (hasDocuments && promptLength > 10000) return ['sambanova', 'deepseek', 'gemini'];
  if (hasDocuments) return ['deepseek', 'sambanova', 'groq', 'hyperbolic'];
  return ['cerebras', 'hyperbolic', 'groq', 'deepseek'];
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
    lower.includes("no documents were provided") ||
    lower.includes("let me search the web")
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
  
  // TRIGGER NEURAL EXTRACTION IF NEEDED (Inter-model interaction)
  // Gemini extracts content from storage (R2/Supabase) so DeepSeek can "see" it.
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

  return await requestQueue.add(async () => {
    let lastError: Error | null = null;
    
    const optimalOrder = selectOptimalProviderOrder(hasDocs, finalPrompt.length);
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
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;
      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        let response = await (callFunction as any)(finalPrompt, history, finalInstruction, hasDocs, docPart);
        
        if (hasDocs && wasDocumentsIgnored(response)) {
          console.warn(`[Node: ${config.name}] Grounding failure. Attempting strict retry...`);
          const strictPrompt = `🔴 STRICT OVERRIDE 🔴\nYOU MUST USE THE <ASSET_VAULT> PROVIDED PREVIOUSLY. DO NOT USE EXTERNAL DATA.\n\n${finalPrompt}`;
          response = await (callFunction as any)(strictPrompt, history, `STRICT_MODE_ACTIVE: ZERO_EXTERNAL_KNOWLEDGE.`, hasDocs, docPart);
        }

        rateLimiter.trackRequest(config.name);
        responseCache.set(prompt, history, response, config.name);
        return { text: response, provider: config.name };
      } catch (e: any) {
        lastError = e;
      }
    }
    throw lastError || new Error("The AI synthesis grid is currently disconnected.");
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
