import { NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";
import { supabase } from "../lib/supabase";

// Local cooldown to prevent hammering the server after a rate limit
let globalCooldownUntil = 0;

function parseAIError(errorData: any): string {
  const msg = typeof errorData === 'string' ? errorData : (errorData?.error || errorData?.message || "");
  const lowerMsg = msg.toLowerCase();
  
  if (lowerMsg.includes('429') || lowerMsg.includes('resource_exhausted') || lowerMsg.includes('saturated')) {
    globalCooldownUntil = Date.now() + 15000; // 15s lock
    return "Neural Grid Saturated: All processing nodes are busy. This usually happens during peak academic hours. Please wait 15 seconds.";
  }
  
  if (lowerMsg.includes('timeout') || lowerMsg.includes('link lost') || lowerMsg.includes('deadline')) {
    return "Handshake Interrupted: The synthesis node took too long to analyze the document. Retrying often switches to a faster node automatically.";
  }

  if (lowerMsg.includes('disconnected') || lowerMsg.includes('exhausted')) {
    return "Grid Offline: All available AI nodes are currently disconnected or at capacity. Please try again in a few minutes.";
  }

  if (lowerMsg.includes('auth') || lowerMsg.includes('unauthorized')) {
    return "Security Violation: Your session has expired. Please sign in again.";
  }

  return msg || "Synthesis interrupted by cloud gateway. Please retry.";
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
    doc: { base64?: string; mimeType?: string; filePath?: string; id?: string }, 
    history: { role: 'user' | 'assistant', content: string }[],
    brain: NeuralBrain,
    user?: UserProfile,
    priorityDocumentId?: string
  ) {
    const wait = this.checkCooldown();
    if (wait > 0) {
      yield `AI Alert: Synthesis cooling down. Retrying in ${wait}s...`;
      return;
    }

    const token = await this.getAuthToken();

    try {
      // FIX: Ensure history and priorityDocumentId are passed to the backend
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          message,
          history,
          priorityDocumentId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Synthesis node failure." }));
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
          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      yield `AI Alert: ${parseAIError("The synthesis gateway is temporarily unreachable. Try again.")}`;
    }
  },

  async *generatePedagogicalToolStream(
    toolType: string,
    userInput: string,
    doc: { base64?: string; mimeType?: string; filePath?: string; id?: string },
    brain: NeuralBrain,
    user?: UserProfile,
    priorityDocumentId?: string
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
          adaptiveContext,
          priorityDocumentId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Synthesis nodes busy." }));
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
          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      yield `AI Alert: ${parseAIError("Heavy curriculum analysis caused a timeout. Try a shorter segment.")}`;
    }
  }
};