import { callGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { callGemini } from './providers/gemini';
import { callDeepSeek } from './providers/deepseek';
import { callCerebras } from './providers/cerebras';
import { callSambaNova } from './providers/sambanova';
import { callHyperbolic } from './providers/hyperbolic';
import { rateLimiter, ProviderConfig } from './rate-limiter';
import { requestQueue } from './request-queue';
import { DEFAULT_MASTER_PROMPT } from '../../constants';
import { isGeminiEnabled } from '../env-server';

/**
 * NEURAL PROVIDER CONFIGURATION
 * Integrates world-class models including ChatGPT via the AI Gateway.
 */
export const PROVIDERS: ProviderConfig[] = [
  { name: 'chatgpt', rpm: 50, rpd: 5000, enabled: !!process.env.AI_GATEWAY_API_KEY },
  { name: 'gemini', rpm: 20, rpd: 2000, enabled: isGeminiEnabled() },
  { name: 'grok', rpm: 30, rpd: 500, enabled: !!process.env.AI_GATEWAY_API_KEY },
  { name: 'deepseek', rpm: 60, rpd: 999999, enabled: !!process.env.DEEPSEEK_API_KEY },
  { name: 'groq', rpm: 30, rpd: 14000, enabled: !!process.env.GROQ_API_KEY },
  { name: 'openrouter', rpm: 50, rpd: 200, enabled: !!process.env.OPENROUTER_API_KEY },
];

/**
 * ChatGPT / OpenAI ADAPTER via AI Gateway
 */
async function callChatGPT(prompt: string, history: any[], system: string, hasDocs: boolean): Promise<string> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY missing - ChatGPT Node Offline');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
        { role: 'user', content: prompt }
      ], 
      temperature: hasDocs ? 0.1 : 0.7 
    })
  });

  if (!res.ok) throw new Error(`ChatGPT Node Failure: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

/**
 * GROK ADAPTER
 */
async function callGrok(prompt: string, history: any[], system: string, hasDocs: boolean): Promise<string> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY missing');

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: 'grok-beta',
      messages: [
        { role: 'system', content: system },
        ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
        { role: 'user', content: prompt }
      ], 
      temperature: hasDocs ? 0.1 : 0.7 
    })
  });

  if (!res.ok) throw new Error(`Grok Node Failure: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

export const PROVIDER_FUNCTIONS = {
  chatgpt: callChatGPT,
  deepseek: callDeepSeek,
  cerebras: callCerebras,
  sambanova: callSambaNova,
  hyperbolic: callHyperbolic,
  groq: callGroq,
  openrouter: callOpenRouter,
  gemini: callGemini,
  grok: callGrok
};

export const MODEL_SPECIALIZATION: Record<string, string> = {
  'lookup': 'gemini',
  'teaching': 'chatgpt', // Specialized for high-fidelity instruction
  'lesson_plan': 'chatgpt', 
  'assessment': 'cerebras',
  'differentiation': 'sambanova',
  'general': 'groq',
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, providerName: string): Promise<T> {
  let timeoutHandle: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`Node ${providerName} timeout`)), timeoutMs);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  clearTimeout(timeoutHandle!);
  return result;
}

export async function synthesize(
  prompt: string,
  history: any[],
  hasDocs: boolean,
  docParts: any[] = [],
  preferredProvider?: string,
  systemInstruction: string = DEFAULT_MASTER_PROMPT
): Promise<{ text: string; provider: string }> {
  return await requestQueue.add<{ text: string; provider: string }>(async () => {
    const sortedProviders = [...PROVIDERS]
      .filter(p => p.enabled)
      .sort((a, b) => {
        if (a.name === preferredProvider) return -1;
        if (b.name === preferredProvider) return 1;
        
        if (hasDocs) {
          const topTier = ['chatgpt', 'gemini'];
          if (topTier.includes(a.name) && !topTier.includes(b.name)) return -1;
          if (!topTier.includes(a.name) && topTier.includes(b.name)) return 1;
        }
        return 0;
      });

    for (const config of sortedProviders) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;
      try {
        const callFunction = PROVIDER_FUNCTIONS[config.name as keyof typeof PROVIDER_FUNCTIONS];
        const response = await withTimeout<string>(
          (callFunction as any)(prompt, history, systemInstruction, hasDocs, docParts),
          35000,
          config.name
        );
        rateLimiter.trackRequest(config.name);
        return { text: response, provider: config.name };
      } catch (e) { 
        console.error(`Node failure: ${config.name}`); 
      }
    }
    throw new Error("Neural Grid Exhausted. All nodes offline.");
  });
}