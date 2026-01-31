import { NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";
import { supabase } from "../lib/supabase";

// Local cooldown to prevent hammering the server after a rate limit
let globalCooldownUntil = 0;

function parseAIError(errorData: any): string {
  const msg = typeof errorData === 'string' ? errorData : (errorData?.error || errorData?.message || "");
  const lowerMsg = msg.toLowerCase();
  
  if (
    lowerMsg.includes('429') || 
    lowerMsg.includes('resource_exhausted') || 
    lowerMsg.includes('saturated') ||
    lowerMsg.includes('too many requests') ||
    lowerMsg.includes('limit reached')
  ) {
    globalCooldownUntil = Date.now() + 15000; // 15s lock
    return "Neural Grid Saturated: All processing nodes for this task are busy. This usually happens during peak academic hours. Please wait 15 seconds.";
  }
  
  if (lowerMsg.includes('timeout') || lowerMsg.includes('deadline') || lowerMsg.includes('interrupted')) {
    return "Handshake Interrupted: The current node took too long. Retrying will automatically route you to a faster grid segment.";
  }

  if (lowerMsg.includes('auth') || lowerMsg.includes('unauthorized') || lowerMsg.includes('session')) {
    return "Security Violation: Your session has expired. Please refresh the app.";
  }

  return msg || "Synthesis interrupted by cloud gateway. Please retry.";
}

/**
 * GLITCH GUARD (v1.0)
 * Detects if the model is repeating the same character/emoji pattern.
 */
function isRepeating(text: string, limit: number = 30): boolean {
  if (text.length < limit) return false;
  const lastN = text.slice(-limit);
  return new Set(lastN.split('')).size <= 2; // Very low variance = loop detected
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

    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, 'chat') : "";
    const token = await this.getAuthToken();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          message,
          history,
          priorityDocumentId,
          adaptiveContext
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

      let fullContent = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          
          fullContent += chunk;
          
          // NEURAL REPETITION GUARD: Abort if sunflower-style glitch detected
          if (isRepeating(fullContent)) {
            reader.cancel();
            yield "\n\n🚨 [Neural Glitch Guard]: Repetitive token loop detected. Synthesis aborted to protect UI integrity. Please rephrase your query.";
            return;
          }

          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      yield `AI Alert: Synthesis gateway unreachable. Verify your connection.`;
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

      let fullContent = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          
          fullContent += chunk;
          if (isRepeating(fullContent)) {
            reader.cancel();
            yield "\n\n🚨 [Neural Glitch Guard]: Recursive pattern detected. Process terminated.";
            return;
          }

          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      yield `AI Alert: Heavy curriculum analysis caused a bottleneck. Switch to a smaller asset segment.`;
    }
  }
};