
import { callGroq } from './providers/groq';
import { callOpenRouter } from './providers/openrouter';
import { callGemini } from './providers/gemini';
import { rateLimiter, ProviderConfig } from './rate-limiter';
import { responseCache } from './response-cache';
import { requestQueue } from './request-queue';

const PROVIDERS: ProviderConfig[] = [
  { name: 'groq', rpm: 28, rpd: 14000, enabled: !!process.env.GROQ_API_KEY },
  { name: 'openrouter', rpm: 45, rpd: 200, enabled: !!process.env.OPENROUTER_API_KEY },
  { name: 'gemini', rpm: 12, rpd: 1400, enabled: !!(process.env.API_KEY || process.env.GEMINI_API_KEY) },
];

export async function generateAIResponse(
  prompt: string,
  history: any[],
  systemInstruction: string,
  docPart?: any
): Promise<{ text: string; provider: string }> {
  const cached = responseCache.get(prompt, history);
  if (cached) return { text: cached, provider: 'cache' };

  return await requestQueue.add(async () => {
    let lastError: Error | null = null;

    for (const config of PROVIDERS.filter(p => p.enabled)) {
      if (!rateLimiter.canMakeRequest(config.name, config)) continue;

      try {
        console.log(`[AI Router] Attempting ${config.name}`);
        let response = "";
        
        if (config.name === 'groq') response = await callGroq(prompt, history, systemInstruction);
        else if (config.name === 'openrouter') response = await callOpenRouter(prompt, history, systemInstruction);
        else if (config.name === 'gemini') response = await callGemini(prompt, history, systemInstruction, docPart);

        rateLimiter.trackRequest(config.name);
        responseCache.set(prompt, history, response, config.name);
        return { text: response, provider: config.name };
      } catch (e: any) {
        console.error(`[AI Router] ${config.name} failed:`, e.message);
        lastError = e;
      }
    }

    throw lastError || new Error("All AI nodes currently unavailable.");
  });
}

export function getProviderStatus() {
  return PROVIDERS.map(config => ({
    name: config.name,
    enabled: config.enabled,
    remaining: rateLimiter.getRemainingRequests(config.name, config),
    limits: { rpm: config.rpm, rpd: config.rpd }
  }));
}
