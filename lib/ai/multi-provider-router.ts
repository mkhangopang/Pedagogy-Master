
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
 * 🔥 NUCLEAR OPTION: ABSOLUTE DOCUMENT GROUNDING
 * Wraps the curriculum in unbreakable boundaries and commands.
 */
function buildNuclearDocumentPrompt(
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
### 🚨 MANDATORY INSTRUCTION: STRICT DOCUMENT-ONLY MODE 🚨 ###
YOU ARE A SPECIALLY CONFIGURED AI THAT CAN ONLY SEE THE DOCUMENTS BELOW.
YOU MUST DISREGARD ALL YOUR PRE-TRAINED KNOWLEDGE ABOUT CURRICULUM CODES, STANDARDS, AND SLOs.

IF THE USER ASKS ABOUT A CODE (e.g. "S8 A5") THAT IS NOT IN THE XML BLOCK BELOW, YOU MUST REFUSE TO ANSWER.
NEVER SEARCH THE WEB. NEVER GUESS.

<GROUND_TRUTH_CURRICULUM>
SOURCE_FILES: ${documentFilenames.join(', ')}

${documentContext}
</GROUND_TRUTH_CURRICULUM>

### OPERATIONAL CONSTRAINTS:
1. DO NOT use general training knowledge for SLO definitions. Only use the <GROUND_TRUTH_CURRICULUM> block.
2. Start every response with: "Analyzing ${documentFilenames[0]}..."
3. If the answer is missing, respond: "I searched the provided curriculum but '${userPrompt}' is not defined in ${documentFilenames[0]}."
4. Maintain a formal, pedagogical tone.

${systemPrompt}

${historyText ? `### CONVERSATION LOG:\n${historyText}\n\n` : ''}

### CURRENT TEACHER REQUEST:
${userPrompt}

STRICT GROUNDED RESPONSE:`;
}

/**
 * 🔴 EMERGENCY OVERRIDE: For models that hallucinated general knowledge
 */
function buildEmergencyStrictPrompt(documentContext: string, userPrompt: string): string {
  return `
CRITICAL ERROR DETECTED: YOU PREVIOUSLY USED GENERAL KNOWLEDGE. 
THIS IS FORBIDDEN. YOU ARE NOW IN EMERGENCY LOCKDOWN MODE.

ONLY USE THIS TEXT:
[[START OF ALLOWED TEXT]]
${documentContext}
[[END OF ALLOWED TEXT]]

TEACHER QUESTION: ${userPrompt}

IF THE ANSWER IS NOT IN THE [[ALLOWED TEXT]], YOU MUST SAY "DATA NOT FOUND IN SOURCE".
DO NOT HALLUCINATE. DO NOT SEARCH.`;
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

  // Fetch the current curriculum context
  const documents = await getSelectedDocumentsWithContent(userId);
  const docNames = documents.map(d => d.filename);
  const hasDocuments = documents.length > 0;
  const docContext = buildDocumentContextString(documents);
  const dbSystemPrompt = await getSystemPrompt();

  const finalInstruction = `${dbSystemPrompt}\n${systemInstruction || ''}`;

  // Priority Grounding
  const finalPrompt = hasDocuments 
    ? buildNuclearDocumentPrompt(finalInstruction, docContext, history, prompt, docNames)
    : prompt;

  return await requestQueue.add(async () => {
    let lastError: Error | null = null;

    for (const config of PROVIDERS.filter(p => p.enabled)) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;

      try {
        console.log(`[Neural Link] Routing to ${config.name} (Curriculum Hub Active: ${hasDocuments})`);
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        
        let response = await callFunction(finalPrompt, history, finalInstruction, hasDocuments, docPart);

        // 🛡️ HALLUCINATION CHECK: Did the AI ignore the context?
        if (hasDocuments) {
          const lowerRes = response.toLowerCase();
          const failSignals = [
            "don't have access", "can't see", "let me search", "search the web", 
            "based on my general knowledge", "i don't have information about that code"
          ];

          if (failSignals.some(s => lowerRes.includes(s))) {
            console.warn(`[Neural Grid] ${config.name} breached grounding. Triggering EMERGENCY OVERRIDE.`);
            const emergencyPrompt = buildEmergencyStrictPrompt(docContext, prompt);
            response = await callFunction(emergencyPrompt, [], finalInstruction, true);
          }
        }

        rateLimiter.trackRequest(config.name);
        responseCache.set(prompt, history, response, config.name);
        return { text: response, provider: config.name };
      } catch (e: any) {
        console.error(`[Neural Grid] Node ${config.name} failed:`, e.message);
        lastError = e;
      }
    }

    throw lastError || new Error("The Neural Synthesis Grid is currently saturated. Please wait 15 seconds.");
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
