
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
  // Recognize both standard and Vercel-prefixed Gemini keys
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

/**
 * Builds a rich text context from selected documents so text-only models (Groq) 
 * can respond to document-specific queries.
 */
export async function buildDocumentContext(userId: string): Promise<string> {
  try {
    const { data: docs } = await supabase
      .from('documents')
      .select('name, subject, grade_level, extracted_text')
      .eq('user_id', userId)
      .eq('is_selected', true)
      .limit(3);

    if (!docs || docs.length === 0) return "";

    let context = `\n### ACTIVE CURRICULUM CONTEXT (KNOWLEDGE BASE)\nThe user has selected ${docs.length} documents for this session. Your response must align with these materials:\n`;
    
    docs.forEach(d => {
      context += `\nDOCUMENT: ${d.name}\nSUBJECT: ${d.subject}\nGRADE: ${d.grade_level}\nCONTENT SNIPPET: ${d.extracted_text?.substring(0, 3000) || "Text not extracted yet."}\n---`;
    });

    return context;
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

  // Merge everything into a unified system instruction for all providers
  const finalInstruction = `${dbSystemPrompt}\n${systemInstruction || ''}\n${docContext}`;

  return await requestQueue.add(async () => {
    let lastError: Error | null = null;

    for (const config of PROVIDERS.filter(p => p.enabled)) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;

      try {
        console.log(`[Neural Router] Attempting ${config.name} with document context awareness.`);
        let response = "";
        
        // Pass the finalInstruction (which now contains doc text) to ALL providers
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

export function getProviderStatus() {
  return PROVIDERS.map(config => ({
    name: config.name,
    enabled: config.enabled,
    limits: { rpm: config.rpm, rpd: config.rpd },
    remaining: rateLimiter.getRemainingRequests(config.name, config)
  }));
}
