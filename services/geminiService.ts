
import { SLO, NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";
import { supabase } from "../lib/supabase";

function parseAIError(errorData: any): string {
  const msg = typeof errorData === 'string' ? errorData : (errorData?.error || errorData?.message || "");
  const lowerMsg = msg.toLowerCase();
  
  if (lowerMsg.includes('429') || lowerMsg.includes('resource_exhausted') || lowerMsg.includes('saturated')) {
    return "Neural Capacity Reached: Gemini Free Tier is temporarily busy. Please wait 20 seconds for the RPM bucket to refill.";
  }
  if (lowerMsg.includes('api_key') || lowerMsg.includes('auth')) {
    return "Neural Key Error: The API key is invalid or hasn't propagated to the cloud environment.";
  }
  return msg || "Synthesis interrupted. Please retry in a moment.";
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

    let response: Response | null = null;
    let attempts = 0;
    
    // Client-side transient retry wrapper
    while (attempts < 2) {
      try {
        response = await fetch('/api/ai', {
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
        if (response.status === 429 && attempts < 1) {
          attempts++;
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        break;
      } catch (e) {
        if (attempts >= 1) break;
        attempts++;
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!response || !response.ok) {
      const errorData = await response?.json().catch(() => ({ error: "Neural link lost." }));
      yield `AI Alert: ${parseAIError(errorData || "Gateway timeout.")}`;
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
          yield "\n\n[System Alert: Neural capacity exceeded. Please pause for 20s.]";
          break;
        }
        yield chunk;
      }
    } finally {
      reader.releaseLock();
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

    let response: Response | null = null;
    let attempts = 0;
    
    while (attempts < 2) {
      try {
        response = await fetch('/api/ai', {
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
        if (response.status === 429 && attempts < 1) {
          attempts++;
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        break;
      } catch (e) {
        if (attempts >= 1) break;
        attempts++;
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!response || !response.ok) {
      const errorData = await response?.json().catch(() => ({ error: "Synthesis node busy." }));
      yield `AI Alert: ${parseAIError(errorData || "Gateway timeout.")}`;
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
          yield "\n\n[Neural Alert: Synthesis paused due to quota limit. Please wait 20s.]";
          break;
        }
        yield chunk;
      }
    } finally {
      reader.releaseLock();
    }
  }
};
