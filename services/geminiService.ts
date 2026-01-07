
import { SLO, NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";
import { supabase } from "../lib/supabase";

function parseAIError(errorData: any): string {
  const msg = typeof errorData === 'string' ? errorData : (errorData?.error || errorData?.message || "");
  const lowerMsg = msg.toLowerCase();
  
  if (lowerMsg.includes('429') || lowerMsg.includes('resource_exhausted')) {
    return "Neural Capacity Reached: You've hit the Gemini Free Tier limit. Please wait 15 seconds for nodes to reset.";
  }
  if (lowerMsg.includes('api_key') || lowerMsg.includes('auth')) {
    return "Neural Auth Error: The Gemini API Key is invalid or missing in Vercel environment variables.";
  }
  return msg || "Synthesis interrupted by network. Please try again.";
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
        const errorData = await response.json().catch(() => ({ error: "Neural link dropped." }));
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
            yield "\n\n[System Alert: Neural API Key Verification Failed.]";
            break;
          }
          if (chunk.includes('ERROR_SIGNAL:RATE_LIMIT')) {
            yield "\n\n[System Alert: High load on Free Tier nodes. Automatic retrying is active, but please pause for 10s if this persists.]";
            break;
          }
          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      yield "AI Alert: Neural gateway connection failed. Check your network status.";
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
        const errorData = await response.json().catch(() => ({ error: "Synthesis node timeout." }));
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
            yield "\n\n[Neural Alert: Quota Limit hit. Synthesis paused.]";
            break;
          }
          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      yield "AI Alert: Resource synthesis failed due to a physical network interruption.";
    }
  }
};
