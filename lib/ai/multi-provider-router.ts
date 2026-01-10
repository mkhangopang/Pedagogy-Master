
import { SupabaseClient } from '@supabase/supabase-js';
import { callGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { callGemini } from './providers/gemini';
import { rateLimiter, ProviderConfig } from './rate-limiter';
import { responseCache } from './response-cache';
import { requestQueue } from './request-queue';
import { getSelectedDocumentsWithContent, buildDocumentContextString } from '../documents/document-fetcher';
import { DEFAULT_MASTER_PROMPT, NUCLEAR_GROUNDING_DIRECTIVE, STRICT_SYSTEM_INSTRUCTION } from '../../constants';

const PROVIDERS: ProviderConfig[] = [
  { 
    name: 'gemini', 
    rpm: 15, 
    rpd: 1500, 
    enabled: !!(process.env.API_KEY || process.env.GEMINI_API_KEY) 
  },
  { name: 'openrouter', rpm: 50, rpd: 500, enabled: !!process.env.OPENROUTER_API_KEY },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY },
];

const PROVIDER_FUNCTIONS = {
  openrouter: callOpenRouter,
  gemini: callGemini,
  groq: callGroq,
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
 * 🔥 NUCLEAR GROUNDING PROMPT
 * Uses centralized templates from constants.ts to ensure permanent core functionality.
 */
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

/**
 * Checks if the AI response indicates it ignored the provided documents.
 */
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
    
    // Sort providers to prefer Gemini when documents are present (multimodal advantage)
    const sortedProviders = [...PROVIDERS].sort((a, b) => {
      if (hasDocs && a.name === 'gemini') return -1;
      return 0;
    });

    for (const config of sortedProviders.filter(p => p.enabled)) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;
      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        let response = await callFunction(finalPrompt, history, finalInstruction, hasDocs, docPart);
        
        // --- POST-SYNTHESIS VALIDATION & RETRY ---
        if (hasDocs && wasDocumentsIgnored(response)) {
          console.warn(`[Node: ${config.name}] Grounding failure. Attempting strict retry...`);
          const strictPrompt = `🔴 STRICT OVERRIDE 🔴\nYOU MUST USE THE <ASSET_VAULT> PROVIDED PREVIOUSLY. DO NOT USE EXTERNAL DATA.\n\n${finalPrompt}`;
          response = await callFunction(strictPrompt, history, `STRICT_MODE_ACTIVE: ZERO_EXTERNAL_KNOWLEDGE.`, hasDocs, docPart);
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
