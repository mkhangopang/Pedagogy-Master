
import { supabase } from '../supabase';
import { callGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { callGemini } from './providers/gemini';
import { rateLimiter, ProviderConfig } from './rate-limiter';
import { responseCache } from './response-cache';
import { requestQueue } from './request-queue';
import { getSelectedDocumentsWithContent, buildDocumentContextString } from '../documents/document-fetcher';
import { DEFAULT_MASTER_PROMPT, APP_NAME } from '../../constants';

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
 * 🔒 SPECIALIZED TOOL PROMPT FACTORY
 * Ensures each tool remains restricted to its core mission and optimized for tokens.
 */
function buildSpecializedToolPrompt(toolType: string, userInput: string, documentContext: string, basePrompt: string): string {
  const toolMission = {
    'lesson-plan': "Strictly generate a high-quality pedagogical lesson plan. DO NOT include rubrics, quizzes, or assessments unless they are explicitly part of the instructional flow. Focus on: Hook, Input, Guided Practice, and Closure.",
    'assessment': "Strictly generate assessment items (MCQs, CRQs, or Short Answers). DO NOT generate lesson plans or long-form teaching materials. Focus on alignment with SLOs and cognitive rigor. For CRQs (Constructed Response Questions), focus on synthesis.",
    'rubric': "Strictly generate a grading rubric with clear criteria and level descriptors. DO NOT generate lesson content or quizzes.",
    'slo-tagger': "Strictly identify and extract Student Learning Objectives (SLOs) and curriculum codes. Map them to Bloom's levels. DO NOT generate lessons or assessments."
  }[toolType] || "Generate the requested educational artifact.";

  return `
### SPECIALIZED NEURAL TASK: ${toolType.toUpperCase()}
SYSTEM: ${basePrompt}
MISSION: ${toolMission}

VAULT_CONTEXT:
${documentContext}

REQUEST:
${userInput}

RESTRICTION: Deliver ONLY the ${toolType} artifact. No preamble. NO BOLD HEADINGS. Use numbered headers (1., 1.1).
  `;
}

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
1. **ZERO EXTERNAL KNOWLEDGE**: You must not use your general training.
2. **VAULT DOMINANCE**: Use ONLY the text provided below.
3. **FORMATTING**: Use 1. and 1.1. for headers. DO NOT BOLD HEADINGS.
4. **MODERATE RESPONSE**: Keep content focused and efficient to save user tokens.

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
- Use numbered hierarchies only.

ASSET_SYNTHESIS:`;
}

export async function generateAIResponse(
  prompt: string,
  history: any[],
  userId: string,
  systemInstruction?: string,
  docPart?: any,
  toolType?: string
): Promise<{ text: string; provider: string }> {
  const cached = responseCache.get(prompt, history);
  if (cached) return { text: cached, provider: 'cache' };

  const documents = await getSelectedDocumentsWithContent(userId);
  const docNames = documents.map(d => d.filename);
  const hasDocs = documents.length > 0;
  const docContext = buildDocumentContextString(documents);
  const dbSystemPrompt = await getSystemPrompt();

  let finalPrompt = prompt;
  if (toolType) {
    finalPrompt = buildSpecializedToolPrompt(toolType, prompt, docContext, dbSystemPrompt);
  } else if (hasDocs) {
    finalPrompt = buildDocumentCenteredPrompt(dbSystemPrompt + "\n" + (systemInstruction || ''), docContext, history, prompt, docNames);
  }

  const finalInstruction = hasDocs 
    ? `DOCUMENT_ONLY_MODE_ACTIVE. You are a specialized curriculum analyzer. USE NUMBERED HEADINGS. NO BOLD HEADINGS. BE CONCISE.`
    : `${dbSystemPrompt}. BE CONCISE. NO BOLD HEADINGS.`;

  return await requestQueue.add(async () => {
    let lastError: Error | null = null;
    const sortedProviders = [...PROVIDERS].sort((a, b) => {
      if (hasDocs && a.name === 'gemini') return -1;
      if (hasDocs && b.name === 'gemini') return 1;
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
