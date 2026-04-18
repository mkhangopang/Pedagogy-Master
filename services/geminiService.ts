
import { NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";
import { supabase } from "../lib/supabase";

// Local cooldown to prevent hammering the server after a rate limit
let globalCooldownUntil = 0;

function parseAIError(errorData: any): string {
  const msg = typeof errorData === 'string' ? errorData : (errorData?.error || errorData?.message || "");
  
  if (msg.startsWith('AI Alert:')) return msg;

  const lowerMsg = msg.toLowerCase();
  
  if (lowerMsg.includes('grid_saturated') || lowerMsg.includes('saturated') || lowerMsg.includes('429')) {
    return "AI Alert: Synthesis grid saturated. Please wait 60s for neural cooling.";
  }
  if (lowerMsg.includes('grid_fault') || lowerMsg.includes('vault_error')) {
    return "AI Alert: Neural context node missing. Try re-selecting the document.";
  }
  if (lowerMsg.includes('timeout') || lowerMsg.includes('deadline') || lowerMsg.includes('504')) {
    return "AI Alert: Neural handshake timed out. Retrying connection...";
  }
  if (lowerMsg.includes('quota') || lowerMsg.includes('exhausted')) {
    return "AI Alert: Neural quota exhausted for this node. Try again in a few minutes.";
  }

  return "AI Alert: Synthesis grid exception. Check your connectivity.";
}

/**
 * GLITCH GUARD (v2.0)
 * Detects if the model is repeating the same character/emoji pattern.
 */
function isRepeating(text: string, limit: number = 30): boolean {
  if (text.length < limit) return false;
  const lastN = text.slice(-limit);
  return new Set(lastN.split('')).size <= 2;
}

/**
 * SSE PARSER (v1.0)
 *
 * FIX: The previous code yielded raw SSE bytes directly (e.g. `data: {"token":"word "}\n\n`).
 * The Chat and Tools views accumulated those raw bytes into `fullContent` and then
 * rendered the SSE markup as visible text — producing garbage output.
 *
 * This function parses a raw SSE byte stream and yields only the decoded token strings.
 * It buffers partial events across read() calls to handle chunk boundaries correctly.
 */
async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      const events = buffer.split('\n\n');
      // Keep the last (possibly incomplete) event in the buffer
      buffer = events.pop() ?? '';

      for (const event of events) {
        const line = event.trim();
        if (!line || line === 'data: [DONE]') continue;

        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6); // strip "data: "
          try {
            const parsed = JSON.parse(jsonStr);
            // Our SSE format: { token: "..." }
            if (parsed?.token !== undefined) {
              yield String(parsed.token);
            } else if (typeof parsed === 'string') {
              yield parsed;
            }
          } catch {
            // Not JSON — yield the raw data as-is (e.g. error messages)
            yield jsonStr;
          }
        }
      }
    }

    // Flush any remaining buffer content
    if (buffer.trim() && buffer.trim() !== 'data: [DONE]') {
      const line = buffer.trim();
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6);
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed?.token !== undefined) yield String(parsed.token);
        } catch {
          yield jsonStr;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
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
          // FIX: Send the clean message as-is — no persona wrapping here.
          // Persona/context lives in adaptiveContext (server-side) not in the user query.
          message,
          history,
          priorityDocumentId,
          adaptiveContext
          // FIX BUG 9: base64 removed — document content comes from RAG, not inline upload
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "AI Alert: Synthesis grid exception." }));
        // If cooldown needed, set it
        if (response.status === 429) {
          globalCooldownUntil = Date.now() + 60000;
        }
        yield parseAIError(errorData);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      let fullContent = "";

      // FIX: Use SSE parser instead of yielding raw bytes.
      for await (const token of parseSSEStream(reader)) {
        fullContent += token;

        if (isRepeating(fullContent)) {
          yield "\n\n🚨 [Neural Glitch Guard]: Repetitive token loop detected. Synthesis aborted.";
          return;
        }

        yield token;
      }

    } catch (err) {
      yield `AI Alert: Synthesis grid exception.`;
    }
  },

  async *generatePedagogicalToolStream(
    toolType: string,
    userInput: string,
    doc: { base64?: string; mimeType?: string; filePath?: string; id?: string },
    brain: NeuralBrain,
    user?: UserProfile,
    priorityDocumentId?: string,
    adaptiveContextOverride?: string
  ) {
    const wait = this.checkCooldown();
    if (wait > 0) {
      yield `AI Alert: System is cooling down. Retry in ${wait}s.`;
      return;
    }

    // FIX BUG 4: Build adaptiveContext here (persona, modes, workflow context) so it
    // stays in the system prompt layer — NOT injected into userInput which
    // pollutes the RAG embedding query.
    const baseAdaptiveContext = user ? await adaptiveService.buildFullContext(user.id, toolType) : "";
    const adaptiveContext = adaptiveContextOverride
      ? `${baseAdaptiveContext}\n${adaptiveContextOverride}`
      : baseAdaptiveContext;

    const token = await this.getAuthToken();

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          toolType,
          // FIX BUG 4: userInput is now the CLEAN user query only.
          // Persona context goes into adaptiveContext, not here.
          userInput,
          // FIX BUG 9: doc.base64 removed — server uses RAG, not inline base64.
          // Only send the document ID for server-side RAG retrieval.
          priorityDocumentId,
          adaptiveContext,
          history: []
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "AI Alert: Synthesis grid exception." }));
        if (response.status === 429) {
          globalCooldownUntil = Date.now() + 60000;
        }
        yield parseAIError(errorData);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      let fullContent = "";

      // FIX: Parse SSE tokens properly
      for await (const token of parseSSEStream(reader)) {
        fullContent += token;

        if (isRepeating(fullContent)) {
          yield "\n\n🚨 [Neural Glitch Guard]: Recursive pattern detected.";
          return;
        }

        yield token;
      }

    } catch (err) {
      yield `AI Alert: Synthesis grid exception.`;
    }
  }
};
