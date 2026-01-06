
import { SLO, NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";
import { supabase } from "../lib/supabase";

function parseAIError(errorData: any): string {
  if (typeof errorData === 'string') {
    if (errorData.includes('429') || errorData.includes('RESOURCE_EXHAUSTED')) {
      return "Neural Rate Limit: Processing nodes are busy. Please wait 15 seconds.";
    }
    return errorData;
  }
  
  const msg = errorData?.error || errorData?.message || "Synthesis interrupted. Please try again.";
  if (msg.includes('429')) return "Neural Rate Limit: Nodes saturated. Please pause for 15s.";
  return msg;
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

    try {
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
        const errorData = await response.json().catch(() => ({ error: "Neural gateway connection failed." }));
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
            yield "\n\n[System: High load detected. Please pause for 10 seconds.]";
            break;
          }
          if (chunk.includes('ERROR_SIGNAL:INTERRUPTED')) {
            yield "\n\n[System: Neural connection lost. Please try refining your request.]";
            break;
          }
          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      yield "AI Alert: Neural connection failed. Check your network or VPN.";
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
        const errorData = await response.json().catch(() => ({ error: "Resource synthesis node offline." }));
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
            yield "\n\n[Neural Alert: Processing capacity reached. Synthesis paused.]";
            break;
          }
          if (chunk.includes('ERROR_SIGNAL:INTERRUPTED')) {
            yield "\n\n[Neural Alert: Synthesis engine disconnected.]";
            break;
          }
          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      yield "AI Alert: Resource synthesis failed due to a network connection error.";
    }
  }
};
