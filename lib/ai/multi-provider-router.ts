
import { supabase } from '../supabase';
import { callGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { callGemini } from './providers/gemini';
import { rateLimiter, ProviderConfig } from './rate-limiter';
import { responseCache } from './response-cache';
import { requestQueue } from './request-queue';
import { DEFAULT_MASTER_PROMPT } from '../../constants';

const PROVIDERS: ProviderConfig[] = [
  { name: 'groq', rpm: 28, rpd: 14000, enabled: !!process.env.GROQ_API_KEY },
  { name: 'openrouter', rpm: 45, rpd: 200, enabled: !!process.env.OPENROUTER_API_KEY },
  // Gemini is enabled if the official API_KEY or GEMINI_API_KEY alias is present
  { name: 'gemini', rpm: 12, rpd: 1400, enabled: !!(process.env.API_KEY || process.env.GEMINI_API_KEY) },
];

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

export async function buildDocumentContext(userId: string): Promise<string> {
  try {
    const { data: docs } = await supabase
      .from('documents')
      .select('name, file_path, subject, grade_level')
      .eq('user_id', userId)
      .eq('is_selected', true)
      .limit(3);

    if (!docs || docs.length === 0) return "";

    return `\n### ACTIVE CURRICULUM CONTEXT\nThe educator has selected the following documents for this synthesis:
${docs.map(d => `- ${d.name} (Subject: ${d.subject}, Grade: ${d.grade_level})`).join('\n')}
Reference the pedagogical markers found in these specific curriculum nodes.`;
  } catch (e) {
    return "";
  }
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

  // Fetch updated contexts
  const [docContext, dbSystemPrompt] = await Promise.all([
    buildDocumentContext(userId),
    getSystemPrompt()
  ]);

  const finalInstruction = `${dbSystemPrompt}\n${systemInstruction || ''}\n${docContext}`;

  return await requestQueue.add(async () => {
    let lastError: Error | null = null;

    for (const config of PROVIDERS.filter(p => p.enabled)) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;

      try {
        console.log(`[Neural Router] Attempting ${config.name}`);
        let response = "";
        
        if (config.name === 'groq') response = await callGroq(prompt, history, finalInstruction);
        else if (config.name === 'openrouter') response = await callOpenRouter(prompt, history, finalInstruction);
        else if (config.name === 'gemini') response = await callGemini(prompt, history, finalInstruction, docPart);

        rateLimiter.trackRequest(config.name);
        responseCache.set(prompt, history, response, config.name);
        return { text: response, provider: config.name };
      } catch (e: any) {
        console.error(`[Neural Router] ${config.name} failure:`, e.message);
        lastError = e;
      }
    }

    throw lastError || new Error("All AI nodes currently saturated.");
  });
}

/**
 * Returns the current health and quota status of all AI nodes.
 */
export function getProviderStatus() {
  return PROVIDERS.map(config => ({
    name: config.name,
    enabled: config.enabled,
    limits: { rpm: config.rpm, rpd: config.rpd },
    remaining: rateLimiter.getRemainingRequests(config.name, config)
  }));
}
