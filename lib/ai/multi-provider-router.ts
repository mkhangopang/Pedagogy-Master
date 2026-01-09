
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
  { name: 'groq', rpm: 28, rpd: 14000, enabled: !!process.env.GROQ_API_KEY },
  { name: 'openrouter', rpm: 45, rpd: 200, enabled: !!process.env.OPENROUTER_API_KEY },
  { name: 'gemini', rpm: 12, rpd: 1400, enabled: !!(process.env.API_KEY || process.env.GEMINI_API_KEY) },
];

const PROVIDER_FUNCTIONS = {
  groq: callGroq,
  openrouter: callOpenRouter,
  gemini: callGemini,
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
 * 🔥 NUCLEAR OPTION: DOCUMENT-FIRST PROMPT
 * Ensures the document context is wrapped in high-priority markers and appears BEFORE instructions.
 */
function buildDocumentFirstPrompt(
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
🚨🚨🚨 MANDATORY: READ THE DOCUMENTS BELOW. THIS IS YOUR ONLY SOURCE OF TRUTH. 🚨🚨🚨

YOU ARE IN "STRICT CURRICULUM GROUNDING" MODE. 
THE TEACHER HAS UPLOADED SPECIFIC DOCUMENTS. YOU MUST USE ONLY THESE DOCUMENTS.

STOP! 🛑
❌ DO NOT search the web.
❌ DO NOT use your general knowledge.
❌ DO NOT say "I don't have access to that information" because it is PROVIDED BELOW.
❌ DO NOT suggest general activities if the curriculum specifies specific ones.

<CURRICULUM_DOCUMENTS>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 SOURCE ASSETS: ${documentFilenames.join(', ')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${documentContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF CURRICULUM DOCUMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
</CURRICULUM_DOCUMENTS>

### YOUR TASK:
1. Base your entire response on the <CURRICULUM_DOCUMENTS> section.
2. If asked about SLO codes (e.g., "S8 A7"), find them in the text above. 
3. Start your response by acknowledging the source: "Based on the curriculum document '${documentFilenames[0]}', ..."
4. If the info is missing, say: "This information is not found in the uploaded curriculum documents."

${systemPrompt}

${historyText ? `### CONVERSATION HISTORY:\n${historyText}\n\n` : ''}

### TEACHER'S CURRENT REQUEST:
${userPrompt}

AI RESPONSE (Grounded ONLY in curriculum):`;
}

/**
 * 🔴 STRICT MODE: For retry if AI hallucinated or ignored context
 */
function buildStrictRetryPrompt(documentContext: string, userPrompt: string): string {
  return `
STRICT ENFORCEMENT REQUIRED.
You previously failed to use the provided curriculum documents. This is a critical error.

YOU MUST ANSWER THE FOLLOWING QUESTION USING ONLY THE TEXT IN <DOCS>.
IF THE ANSWER IS NOT IN <DOCS>, YOU MUST SAY "INFO NOT IN CURRICULUM".

<DOCS>
${documentContext}
</DOCS>

QUESTION: ${userPrompt}

RESPONSE (Directly citing <DOCS>):`;
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

  // 1. Fetch updated document context and system rules
  const documents = await getSelectedDocumentsWithContent(userId);
  const docNames = documents.map(d => d.filename);
  const hasDocuments = documents.length > 0;
  const docContext = buildDocumentContextString(documents);
  const dbSystemPrompt = await getSystemPrompt();

  const finalInstruction = `${dbSystemPrompt}\n${systemInstruction || ''}`;

  // 2. Build the primary prompt
  const fullPrompt = hasDocuments 
    ? buildDocumentFirstPrompt(finalInstruction, docContext, history, prompt, docNames)
    : prompt;

  return await requestQueue.add(async () => {
    let lastError: Error | null = null;

    for (const config of PROVIDERS.filter(p => p.enabled)) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;

      try {
        console.log(`[Neural Router] Attempting ${config.name} (Documents Active: ${hasDocuments})`);
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        
        let response = await callFunction(fullPrompt, history, finalInstruction, hasDocuments, docPart);

        // 3. VALIDATION: Check for "Hallucination" or "Ignored context" signatures
        if (hasDocuments) {
          const lowerRes = response.toLowerCase();
          const ignoredSignals = [
            "i don't have access",
            "as an ai i cannot read",
            "let me search the web",
            "i don't have information about that specific code",
            "based on general knowledge"
          ];

          if (ignoredSignals.some(signal => lowerRes.includes(signal))) {
            console.warn(`[Neural Router] ${config.name} ignored context. Triggering STRICT RETRY.`);
            const retryPrompt = buildStrictRetryPrompt(docContext, prompt);
            response = await callFunction(retryPrompt, [], finalInstruction, true);
          }
        }

        rateLimiter.trackRequest(config.name);
        responseCache.set(prompt, history, response, config.name);
        return { text: response, provider: config.name };
      } catch (e: any) {
        console.error(`[Neural Router] ${config.name} node failure:`, e.message);
        lastError = e;
      }
    }

    throw lastError || new Error("AI Synthesis Grid is currently offline or saturated.");
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
