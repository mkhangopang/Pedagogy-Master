
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
import { getSelectedDocumentsWithContent, buildDocumentContextString } from '../documents/document-fetcher';
import { DEFAULT_MASTER_PROMPT, NUCLEAR_GROUNDING_DIRECTIVE, STRICT_SYSTEM_INSTRUCTION, APP_NAME } from '../../constants';

const PROVIDERS: ProviderConfig[] = [
  // TIER 1: UNLIMITED FREE (High RPM)
  { name: 'deepseek', rpm: 58, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY },
  { name: 'cerebras', rpm: 118, rpd: 999999, enabled: !!process.env.CEREBRAS_API_KEY },
  { name: 'sambanova', rpm: 98, rpd: 999999, enabled: !!process.env.SAMBANOVA_API_KEY },
  { name: 'hyperbolic', rpm: 48, rpd: 999999, enabled: !!process.env.HYPERBOLIC_API_KEY },
  
  // TIER 2: HIGH LIMITS (Reliable)
  { name: 'groq', rpm: 28, rpd: 14000, enabled: !!process.env.GROQ_API_KEY },
  { name: 'openrouter', rpm: 50, rpd: 200, enabled: !!process.env.OPENROUTER_API_KEY },
  
  // TIER 3: FALLBACK
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

export async function getSystemPrompt(supabase: SupabaseClient): Promise<string> {
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
}

/**
 * Prioritize providers based on workload type and prompt length.
 */
function selectOptimalProviderOrder(hasDocuments: boolean, promptLength: number): string[] {
  if (hasDocuments && promptLength > 5000) {
    // Large documents: Use big context windows
    return ['sambanova', 'deepseek', 'gemini', 'groq'];
  }
  if (hasDocuments) {
    // Normal documents: Use accurate analyzers
    return ['deepseek', 'sambanova', 'groq', 'hyperbolic', 'cerebras'];
  }
  // General chat: Use fastest available
  return ['cerebras', 'hyperbolic', 'groq', 'deepseek', 'openrouter'];
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
    lower.includes("let me search the web") ||
    lower.includes("i don't have information about your specific curriculum")
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

  const documents = await getSelectedDocumentsWithContent(supabase, userId);
  const docNames = documents.map(d => d.filename);
  const hasDocs = documents.length > 0;
  const docContext = buildDocumentContextString(documents);
  const dbSystemPrompt = await getSystemPrompt(supabase);

  const baseInstruction = `${dbSystemPrompt}\n${adaptiveContext || ''}\nRESTRICTION: 1. and 1.1. for headers. NO BOLD HEADINGS. BE CONCISE.`;

  let finalPrompt = prompt;
  let finalInstruction = baseInstruction;

  if (hasDocs) {
    finalPrompt = buildNuclearPrompt(docContext, history, prompt, docNames);
    finalInstruction = STRICT_SYSTEM_INSTRUCTION;
  }

  return await requestQueue.add(async () => {
    let lastError: Error | null = null;
    
    // Smart Load Balancing
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
        
        // Validation & Retry
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
