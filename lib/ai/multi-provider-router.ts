
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
 * Nuclear Fix: Force-grounding prompt builder
 */
function buildDocumentFirstPrompt(
  systemPrompt: string,
  docContext: string,
  history: any[],
  userPrompt: string,
  docNames: string[]
): string {
  const historyText = history
    .slice(-4)
    .map(m => `${m.role === 'user' ? 'Teacher' : 'AI'}: ${m.content}`)
    .join('\n\n');

  return `
🚨 MANDATORY INSTRUCTION: USE ONLY UPLOADED CURRICULUM DOCUMENTS 🚨

THE TEACHER HAS PROVIDED SPECIFIC CURRICULUM CONTEXT BELOW. 
YOU MUST ANALYZE THESE DOCUMENTS FIRST. DO NOT USE GENERAL TRAINING KNOWLEDGE IF IT CONTRADICTS THESE DOCUMENTS.

<CURRICULUM_DOCUMENTS>
PRIMARY SOURCE ASSETS: ${docNames.join(', ')}

${docContext}
</CURRICULUM_DOCUMENTS>

### BEHAVIORAL PROTOCOL:
1. ALWAYS reference "${docNames[0]}" in your response.
2. If asked about SLO codes (e.g. S8 A7), LOCATE them in the XML block above.
3. If information is NOT in the documents, state: "This is not in the curriculum documents." 
4. DO NOT search the web or hallucinate general facts.

${systemPrompt}

${historyText ? `### PREVIOUS CONVERSATION:\n${historyText}\n\n` : ''}
### CURRENT TEACHER REQUEST:
${userPrompt}

AI TUTOR RESPONSE (Grounded in Curriculum):`;
}

function buildStrictDocumentPrompt(docContext: string, userPrompt: string, docNames: string[]): string {
  return `
🔴 STRICT MODE: YOU PREVIOUSLY IGNORED THE CURRICULUM DOCUMENTS.
YOUR TASK IS TO ANSWER THE QUESTION BELOW USING *ONLY* THE TEXT IN THESE TAGS:

<DOCS>
${docContext}
</DOCS>

TEACHER QUESTION: ${userPrompt}

YOU MUST START YOUR RESPONSE WITH: "According to the ${docNames[0]} document..."
DO NOT USE ANY OTHER KNOWLEDGE.`;
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

  // Fetch updated context
  const documents = await getSelectedDocumentsWithContent(userId);
  const docNames = documents.map(d => d.filename);
  const hasDocuments = documents.length > 0;
  const docContext = buildDocumentContextString(documents);
  const dbSystemPrompt = await getSystemPrompt();

  const finalSystemInstruction = `${dbSystemPrompt}\n${systemInstruction || ''}`;
  const nuclearPrompt = hasDocuments 
    ? buildDocumentFirstPrompt(finalSystemInstruction, docContext, history, prompt, docNames)
    : prompt;

  return await requestQueue.add(async () => {
    let lastError: Error | null = null;

    for (const config of PROVIDERS.filter(p => p.enabled)) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;

      try {
        console.log(`[Neural Router] Routing to ${config.name} (Grounded: ${hasDocuments})`);
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        
        let responseText = await callFunction(nuclearPrompt, history, finalSystemInstruction, hasDocuments, docPart);

        // Validation: Check if AI ignored documents (Hallucination detection)
        if (hasDocuments) {
          const ignored = 
            responseText.toLowerCase().includes("i don't have access") || 
            responseText.toLowerCase().includes("i can't see the document") ||
            responseText.toLowerCase().includes("let me search");

          if (ignored) {
            console.warn(`[Neural Router] ${config.name} ignored documents. Retrying with STRICT mode.`);
            const strictPrompt = buildStrictDocumentPrompt(docContext, prompt, docNames);
            responseText = await callFunction(strictPrompt, [], finalSystemInstruction, true);
          }
        }

        rateLimiter.trackRequest(config.name);
        responseCache.set(prompt, history, responseText, config.name);
        return { text: responseText, provider: config.name };
      } catch (e: any) {
        console.error(`[Neural Router] ${config.name} failure:`, e.message);
        lastError = e;
      }
    }

    throw lastError || new Error("All AI nodes currently saturated.");
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
