
import { SLO, NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";
import { supabase } from "../lib/supabase";

function parseAIError(errorData: any): string {
  const msg = typeof errorData === 'string' ? errorData : (errorData?.error || errorData?.message || "");
  const lowerMsg = msg.toLowerCase();
  
  if (lowerMsg.includes('429') || lowerMsg.includes('resource_exhausted')) {
    return "Neural Quota Exceeded: The Gemini free tier has a temporary limit. Please pause for 15s before your next request.";
  }
  if (lowerMsg.includes('api_key') || lowerMsg.includes('auth')) {
    return "Neural Key Error: The server's API key is invalid or not yet propagated in Vercel.";
  }
  return msg || "Neural link interrupted. Please retry in a moment.";
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
          
          if (chunk.includes('ERROR_SIGNAL:AUTH_FAIL')) {
            yield "\n\n[System Alert: API Key verification failed.]";
            break;
          }
          if (chunk.includes('ERROR_SIGNAL:RATE_LIMIT')) {
            yield "\n\n[System Alert: Free tier rate limit reached. Auto-retries failed. Please pause for 10s.]";
            break;
          }
          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      yield "AI Alert: Synthesis gateway timed out.";
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
          
          if (chunk.includes('ERROR_SIGNAL:AUTH_FAIL')) {
            yield "\n\n[Critical: Neural Auth Failure.]";
            break;
          }
          if (chunk.includes('ERROR_SIGNAL:RATE_LIMIT')) {
            yield "\n\n[Neural Alert: Synthesis paused due to quota limit. Please wait 10s.]";
            break;
          }
          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      yield "AI Alert: Physical synthesis failed. Check network.";
    }
  }
};
