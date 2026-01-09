
import { supabase } from '../supabase';
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

export async function getSystemPrompt(): Promise<string> {
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
 * 🔒 ABSOLUTE GROUNDING PROMPT (Document Centered)
 * Forces the AI to identify as a 'Curriculum Asset Intelligence' rather than a general assistant.
 */
function buildDocumentCenteredPrompt(
  systemPrompt: string,
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
1. **ZERO EXTERNAL KNOWLEDGE**: You must not use your general training to define SLOs, curriculum codes, or standards. 
2. **VAULT DOMINANCE**: Use ONLY the text provided in the <ASSET_VAULT> below.
3. **NO WEB SEARCH**: Do not suggest searching the web. Do not use external data.
4. **STRICT CITATION**: Every claim must refer to the specific asset it was drawn from (e.g., "Source: [Filename]").
5. **MISSING DATA**: If information is NOT found within the <ASSET_VAULT>, explicitly state: "DATA_UNAVAILABLE: The requested curriculum component is not present in the current assets."

<ASSET_VAULT>
ACTIVE_FILES: ${documentFilenames.join(', ')}

${documentContext}
</ASSET_VAULT>

---
[TEACHER_PROFILE_AND_HISTORY]
${systemPrompt}

${historyText ? `PREVIOUS_CHAT:\n${historyText}\n\n` : ''}

[CURRENT_TEACHER_REQUEST]
${userPrompt}

[RESPONSE_PROTOCOL]
- Begin with: "Source: [Filename]"
- Precision: 100% (Strict adherence to vault text)
- If the requested SLO or topic is not in the vault, reply: "DATA_UNAVAILABLE: This information is not found in the uploaded curriculum documents."

ASSET_SYNTHESIS:`;
}

/**
 * 🔴 REJECTION RECOVERY: For models that attempted to use general knowledge.
 */
function buildStrictRejectionRetry(documentContext: string, userPrompt: string): string {
  return `
[STRICT_MODE_RETRY]
Your previous attempt failed grounding validation. YOU IGNORED THE DOCUMENTS.
YOU ARE FORBIDDEN FROM USING OUTSIDE KNOWLEDGE OR WEB SEARCH.

ONLY USE THE TEXT BELOW:
<DOC_CONTENT>
${documentContext.substring(0, 15000)}
</DOC_CONTENT>

QUESTION: ${userPrompt}

IF ANSWER IS NOT IN <DOC_CONTENT>, SAY "DATA_UNAVAILABLE: NOT FOUND IN ASSETS".`;
}

export async function generateAIResponse(
  prompt: string,
  history: any[],
  userId: string,
  systemInstruction?: string,
  docPart?: any
): Promise<{ text: string; provider: string }> {
  const cached = responseCache.get(prompt, history);
  if (cached) return { text: cached, provider: 'cache' };

  // 1. Fetch live document context and metadata
  const documents = await getSelectedDocumentsWithContent(userId);
  const docNames = documents.map(d => d.filename);
  const hasDocs = documents.length > 0;
  const docContext = buildDocumentContextString(documents);
  const dbSystemPrompt = await getSystemPrompt();

  const finalInstruction = hasDocs 
    ? `DOCUMENT_ONLY_MODE_ACTIVE. You are a specialized curriculum analyzer. Disregard general training. Use only provided assets.`
    : dbSystemPrompt;

  // 2. Wrap request in the Document-Centered Prompt
  const finalPrompt = hasDocs 
    ? buildDocumentCenteredPrompt(dbSystemPrompt + "\n" + (systemInstruction || ''), docContext, history, prompt, docNames)
    : prompt;

  return await requestQueue.add(async () => {
    let lastError: Error | null = null;

    // Sort PROVIDERS so Gemini is checked first for document tasks
    const sortedProviders = [...PROVIDERS].sort((a, b) => {
      if (hasDocs && a.name === 'gemini') return -1;
      if (hasDocs && b.name === 'gemini') return 1;
      return 0;
    });

    for (const config of sortedProviders.filter(p => p.enabled)) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;

      try {
        console.log(`[Neural Router] Routing to ${config.name} (Grounded: ${hasDocs})`);
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        
        let response = await callFunction(finalPrompt, history, finalInstruction, hasDocs, docPart);

        // 3. Grounding Validation
        if (hasDocs) {
          const lowerRes = response.toLowerCase();
          const breachSignals = [
            "don't have access", "can't see the document", "let me search", 
            "based on my general training", "as an ai model", "search results",
            "i cannot access the file", "could not read the file"
          ].some(signal => lowerRes.includes(signal));

          if (breachSignals) {
            console.warn(`[Neural Router] ${config.name} failed grounding check. Retrying with Strict Mode...`);
            const retryPrompt = buildStrictRejectionRetry(docContext, prompt);
            response = await callFunction(retryPrompt, [], "STRICT_DOCUMENT_GROUNDING: Use provided text only.", true);
          }
        }

        rateLimiter.trackRequest(config.name);
        responseCache.set(prompt, history, response, config.name);
        return { text: response, provider: config.name };
      } catch (e: any) {
        console.error(`[Neural Router] Node failure (${config.name}):`, e.message);
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
