
import { SLO, NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";
import { supabase } from "../lib/supabase";

function parseAIError(raw: string): string {
  try {
    if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
      return "Neural Rate Limit: The free AI nodes are saturated. We've tried multiple reconnects, but a manual 15-second pause is recommended.";
    }
    const parsed = JSON.parse(raw);
    return parsed.error?.message || "Synthesis interrupted. Please try again.";
  } catch (e) {
    return raw.length > 200 ? "Neural Sync Error: Context window saturated." : raw;
  }
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const geminiService = {
  async getAuthToken(): Promise<string | undefined> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  },

  /**
   * Performs fetch with client-side retry for 429s
   */
  async fetchWithRetry(url: string, options: any, retries = 2): Promise<Response> {
    for (let i = 0; i <= retries; i++) {
      const response = await fetch(url, options);
      if (response.status === 429 && i < retries) {
        await delay(5000); // Wait 5s before client retry
        continue;
      }
      return response;
    }
    return fetch(url, options); // Final fallback
  },

  async *chatWithDocumentStream(
    message: string, 
    doc: { base64?: string; mimeType?: string; filePath?: string }, 
    history: { role: 'user' | 'assistant', content: string }[],
    brain: NeuralBrain,
    user?: UserProfile
  ) {
    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, 'chat') : "";
    const token = await this.getAuthToken();

    const response = await this.fetchWithRetry('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        task: 'chat',
        message,
        doc: { base64: doc.filePath ? undefined : doc.base64, mimeType: doc.mimeType, filePath: doc.filePath },
        history,
        brain,
        adaptiveContext
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      yield `AI Alert: ${parseAIError(errorData.error || "Neural gateway timeout")}`;
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.includes('ERROR:RATE_LIMIT_HIT')) {
        yield "\n\n[System: High load detected. Pausing stream to preserve neural stability...]";
        break;
      }
      yield chunk;
    }
  },

  async *generatePedagogicalToolStream(
    toolType: string,
    userInput: string,
    doc: { base64?: string; mimeType?: string; filePath?: string },
    brain: NeuralBrain,
    user?: UserProfile
  ) {
    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, toolType) : "";
    const token = await this.getAuthToken();

    const response = await this.fetchWithRetry('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        task: 'generate-tool',
        toolType,
        userInput,
        doc: { base64: doc.filePath ? undefined : doc.base64, mimeType: doc.mimeType, filePath: doc.filePath },
        brain,
        adaptiveContext
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      yield `AI Alert: ${parseAIError(errorData.error || "Neural gateway timeout")}`;
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.includes('ERROR:RATE_LIMIT_HIT')) {
        yield "\n\n[Neural Alert: Burst limit reached. Resource generation paused.]";
        break;
      }
      yield chunk;
    }
  }
};
