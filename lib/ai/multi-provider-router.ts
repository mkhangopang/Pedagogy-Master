
import { supabase } from '../supabase';
import { callGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { callGemini } from './providers/gemini';
import { rateLimiter, ProviderConfig } from './rate-limiter';
import { responseCache } from './response-cache';
import { requestQueue } from './request-queue';
import { getSelectedDocumentsWithContent, buildDocumentContextString } from '../documents/document-fetcher';
import { DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * AI GRID CONFIGURATION
 * OpenRouter (Llama 3.3 70B) is the primary reasoning node due to its superior instruction following.
 */
const PROVIDERS: ProviderConfig[] = [
  { name: 'openrouter', rpm: 50, rpd: 500, enabled: !!process.env.OPENROUTER_API_KEY },
  { name: 'gemini', rpm: 15, rpd: 1500, enabled: !!(process.env.API_KEY || process.env.GEMINI_API_KEY) },
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
 * 🔒 TOTAL LOCKDOWN PROMPT
 * This prompt creates a conceptual "sandbox" that the AI cannot escape.
 */
function buildLockdownPrompt(
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
[SYSTEM_DIRECTIVE: ABSOLUTE_GROUNDING_ENFORCED]
YOU ARE A CURRICULUM-CENTRIC SYNTHESIS ENGINE. 
YOUR ENTIRE WORLD IS LIMITED TO THE DATA WITHIN THE <CURRICULUM_VAULT> TAGS BELOW.

INSTRUCTIONS:
1. DO NOT mention your general training.
2. DO NOT use external definitions for SLOs or standards.
3. IF A REQUESTED SLO (e.g. S8 A5) IS NOT PHYSICALLY WRITTEN IN THE <CURRICULUM_VAULT>, YOU MUST STATE: "Search Failure: The requested code is not present in the current curriculum assets."
4. ALWAYS cite specific text snippets from the vault.

<CURRICULUM_VAULT>
ACTIVE_ASSETS: ${documentFilenames.join('; ')}

${documentContext}
</CURRICULUM_VAULT>

[CONVERSATION_HISTORY]
${historyText}

[TEACHER_REQUEST]
${userPrompt}

[RESPONSE_PROTOCOL]
- Start with: "From ${documentFilenames[0]}:"
- Temperature: 0.0 (Strictly Factual)
- Output format: Academic and structured.

SYNTHESIS:`;
}

/**
 * 🛑 REJECTION PROTOCOL
 * Triggers if a model attempts to search or use general knowledge.
 */
function buildStrictRejectionRetry(documentContext: string, userPrompt: string): string {
  return `
[REJECTION_NOTICE] 
Your previous response was rejected for using non-vault knowledge. 
YOU ARE FORBIDDEN FROM USING OUTSIDE KNOWLEDGE.

ONLY USE THIS TEXT TO ANSWER:
"${documentContext.substring(0, 5000)}..."

QUESTION: ${userPrompt}

(If it's not in the text, say "NOT FOUND")`;
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

  // 1. Fetch live document context from storage/DB
  const documents = await getSelectedDocumentsWithContent(userId);
  const docNames = documents.map(d => d.filename);
  const hasDocs = documents.length > 0;
  const docContext = buildDocumentContextString(documents);
  const dbSystemPrompt = await getSystemPrompt();

  const finalInstruction = `STRICT DOCUMENT MODE. ${dbSystemPrompt}\n${systemInstruction || ''}`;

  // 2. Wrap request in the Lockdown Prompt if documents are selected
  const finalPrompt = hasDocs 
    ? buildLockdownPrompt(finalInstruction, docContext, history, prompt, docNames)
    : prompt;

  return await requestQueue.add(async () => {
    let lastError: Error | null = null;

    for (const config of PROVIDERS.filter(p => p.enabled)) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;

      try {
        console.log(`[Neural Link] Routing to ${config.name} (Context: ${hasDocs ? 'DOC_ACTIVE' : 'GENERAL'})`);
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        
        let response = await callFunction(finalPrompt, history, finalInstruction, hasDocs, docPart);

        // 3. Hallucination Guard: Reject search-engine behavior
        if (hasDocs) {
          const lowerRes = response.toLowerCase();
          const breachDetected = [
            "don't have access", "can't see that document", "let me search", 
            "based on general knowledge", "search results indicate", "as an ai model"
          ].some(signal => lowerRes.includes(signal));

          if (breachDetected) {
            console.warn(`[Neural Link] ${config.name} breached vault. Retrying with emergency rejection.`);
            const rejectionPrompt = buildStrictRejectionRetry(docContext, prompt);
            response = await callFunction(rejectionPrompt, [], finalInstruction, true);
          }
        }

        rateLimiter.trackRequest(config.name);
        responseCache.set(prompt, history, response, config.name);
        return { text: response, provider: config.name };
      } catch (e: any) {
        console.error(`[Neural Link] Node ${config.name} disconnected:`, e.message);
        lastError = e;
      }
    }

    throw lastError || new Error("The Neural Synthesis Grid is currently unreachable.");
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
