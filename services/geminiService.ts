
import { SLO, NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";
import { supabase } from "../lib/supabase";

function parseAIError(raw: string): string {
  try {
    if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
      return "Neural Rate Limit: The free AI node is temporarily saturated. Please pause for 15 seconds.";
    }
    const parsed = JSON.parse(raw);
    return parsed.error?.message || "Synthesis interrupted. Please try again.";
  } catch (e) {
    return raw.length > 200 ? "Neural Sync Error: The document context is too complex." : raw;
  }
}

export const geminiService = {
  async getAuthToken(): Promise<string | undefined> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
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

    const response = await fetch('/api/ai', {
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
      yield `AI Alert: ${parseAIError(errorData.error || "Connection timeout")}`;
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
        yield "\n\n[System Notification: AI Node saturated. Cooling down...]";
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

    const response = await fetch('/api/ai', {
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
      yield `AI Alert: ${parseAIError(errorData.error || "Connection timeout")}`;
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
        yield "\n\n[Neural Alert: Rate limit exceeded during streaming. Cooldown initiated.]";
        break;
      }
      yield chunk;
    }
  }
};
