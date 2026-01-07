
import { SLO, NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";
import { supabase } from "../lib/supabase";

// Local cooldown to prevent hammering the server after a rate limit
let globalCooldownUntil = 0;

function parseAIError(errorData: any): string {
  const msg = typeof errorData === 'string' ? errorData : (errorData?.error || errorData?.message || "");
  const lowerMsg = msg.toLowerCase();
  
  if (lowerMsg.includes('429') || lowerMsg.includes('resource_exhausted') || lowerMsg.includes('saturated')) {
    globalCooldownUntil = Date.now() + 20000; // 20s lock
    return "Neural Capacity Reached: Gemini Free Tier is cooling down. Please wait 20 seconds before retrying.";
  }
  if (lowerMsg.includes('timeout') || lowerMsg.includes('link lost') || lowerMsg.includes('handshake')) {
    return "Neural Link Interrupted: The connection to the AI node timed out. This usually happens when the document is too large for the Free Tier processing speed.";
  }
  return msg || "Synthesis interrupted. Please retry in a moment.";
}

export const geminiService = {
  async getAuthToken(): Promise<string | undefined> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  },

  checkCooldown() {
    const remaining = Math.ceil((globalCooldownUntil - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  },

  async *chatWithDocumentStream(
    message: string, 
    doc: { base64?: string; mimeType?: string; filePath?: string }, 
    history: { role: 'user' | 'assistant', content: string }[],
    brain: NeuralBrain,
    user?: UserProfile
  ) {
    const wait = this.checkCooldown();
    if (wait > 0) {
      yield `AI Alert: Neural nodes are cooling down. Please wait ${wait}s...`;
      return;
    }

    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, 'chat') : "";
    const token = await this.getAuthToken();

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          task: 'chat',
          message,
          doc: { base64: doc.filePath ? undefined : doc.base64, mimeType: doc.mimeType, filePath: doc.filePath },
          history: history.slice(-4), // Aggressively trim history for quota
          brain,
          adaptiveContext
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Neural link lost." }));
        yield `AI Alert: ${parseAIError(errorData)}`;
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk.includes('ERROR_SIGNAL:RATE_LIMIT')) {
            globalCooldownUntil = Date.now() + 20000;
            yield "\n\n[System Alert: Neural capacity exceeded. Please pause for 20s.]";
            break;
          }
          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      yield `AI Alert: ${parseAIError("Neural link lost. Verify your internet connection.")}`;
    }
  },

  async *generatePedagogicalToolStream(
    toolType: string,
    userInput: string,
    doc: { base64?: string; mimeType?: string; filePath?: string },
    brain: NeuralBrain,
    user?: UserProfile
  ) {
    const wait = this.checkCooldown();
    if (wait > 0) {
      yield `AI Alert: System is cooling down. Retry in ${wait}s.`;
      return;
    }

    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, toolType) : "";
    const token = await this.getAuthToken();

    try {
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
        const errorData = await response.json().catch(() => ({ error: "Synthesis node busy." }));
        yield `AI Alert: ${parseAIError(errorData)}`;
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk.includes('ERROR_SIGNAL:RATE_LIMIT')) {
            globalCooldownUntil = Date.now() + 20000;
            yield "\n\n[Neural Alert: Synthesis paused due to quota limit. Please wait 20s.]";
            break;
          }
          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      yield `AI Alert: ${parseAIError("Synthesis gateway timed out.")}`;
    }
  }
};
