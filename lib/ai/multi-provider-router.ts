
import { SupabaseClient } from '@supabase/supabase-js';
import { callGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { callGemini } from './providers/gemini';
import { rateLimiter, ProviderConfig } from './rate-limiter';
import { responseCache } from './response-cache';
import { requestQueue } from './request-queue';
import { getSelectedDocumentsWithContent, buildDocumentContextString } from '../documents/document-fetcher';
import { DEFAULT_MASTER_PROMPT } from '../../constants';

const PROVIDERS: ProviderConfig[] = [
  { name: 'gemini', rpm: 15, rpd: 1500, enabled: !!(process.env.API_KEY || process.env.GEMINI_API_KEY) },
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
 * 🔒 SPECIALIZED TOOL PROMPT FACTORY
 */
function buildSpecializedToolPrompt(toolType: string, userInput: string, documentContext: string): string {
  const toolMission = {
    'lesson-plan': "Generate a strict pedagogical lesson plan based ONLY on the provided vault.",
    'assessment': "Generate assessment items (MCQs/CRQs) based ONLY on the provided vault.",
    'rubric': "Generate a grading rubric based ONLY on the provided vault content.",
    'slo-tagger': "Extract SLOs from the provided vault."
  }[toolType] || "Process the request using the provided vault.";

  return `
### SPECIALIZED NEURAL TASK: ${toolType.toUpperCase()}
MISSION: ${toolMission}

VAULT_CONTEXT:
${documentContext || '[NO_VAULT_ATTACHED: USE_GENERAL_KNOWLEDGE]'}

REQUEST:
${userInput}

RESTRICTION: Use 1. and 1.1. headings. DO NOT BOLD HEADINGS.
  `;
}

function buildDocumentCenteredPrompt(
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
🚨🚨🚨 MANDATORY: CORE OPERATIONAL DIRECTIVE - DOCUMENT-ONLY SYNTHESIS 🚨🚨🚨
YOU ARE THE INTELLECTUAL EXTENSION OF THE UPLOADED CURRICULUM ASSETS.
YOU HAVE NO KNOWLEDGE OUTSIDE OF THE PROVIDED <ASSET_VAULT>.

INSTRUCTIONS:
1. USE ONLY the text in <ASSET_VAULT>.
2. If info is missing, say: "DATA_UNAVAILABLE: This information is not found in the uploaded curriculum documents."
3. Cite sources: "Source: [Filename]".

<ASSET_VAULT>
ACTIVE_FILES: ${documentFilenames.join(', ')}
${documentContext}
</ASSET_VAULT>

---
[PREVIOUS_CHAT]
${historyText}

[CURRENT_TEACHER_REQUEST]
${userPrompt}

ASSET_SYNTHESIS:`;
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

  // CRITICAL: Fetch documents using the authenticated supabase client
  const documents = await getSelectedDocumentsWithContent(supabase, userId);
  const docNames = documents.map(d => d.filename);
  const hasDocs = documents.length > 0;
  const docContext = buildDocumentContextString(documents);
  const dbSystemPrompt = await getSystemPrompt(supabase);

  // Strength the Master identity & formatting rules
  const baseInstruction = `${dbSystemPrompt}\n${adaptiveContext || ''}\nRESTRICTION: 1. and 1.1. for headers. NO BOLD HEADINGS. BE CONCISE.`;

  let finalPrompt = prompt;
  let finalInstruction = baseInstruction;

  if (toolType) {
    finalPrompt = buildSpecializedToolPrompt(toolType, prompt, docContext);
    if (hasDocs) {
      finalInstruction = `STRICT_DOCUMENT_GROUNDING_ACTIVE. ${baseInstruction}`;
    }
  } else if (hasDocs) {
    finalPrompt = buildDocumentCenteredPrompt(docContext, history, prompt, docNames);
    finalInstruction = `ABSOLUTE_GROUNDING_PROTOCOL_ACTIVE. Use ONLY the <ASSET_VAULT> provided in the message. Disregard general knowledge. ${baseInstruction}`;
  }

  return await requestQueue.add(async () => {
    let lastError: Error | null = null;
    const sortedProviders = [...PROVIDERS].sort((a, b) => {
      if (hasDocs && a.name === 'gemini') return -1;
      return 0;
    });

    for (const config of sortedProviders.filter(p => p.enabled)) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;
      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        let response = await callFunction(finalPrompt, history, finalInstruction, hasDocs, docPart);
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
