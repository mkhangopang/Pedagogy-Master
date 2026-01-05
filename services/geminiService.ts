
import { SLO, NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";
import { supabase } from "../lib/supabase";

/**
 * GOOGLE GENERATIVE AI SERVICE
 * High-performance server-based bridge for pedagogical AI synthesis.
 */
export const geminiService = {
  /**
   * Helper to get the current auth token
   */
  async getAuthToken(): Promise<string | undefined> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  },

  /**
   * Proxies a multimodal streaming chat request.
   */
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
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        task: 'chat',
        message,
        doc: { 
          base64: doc.filePath ? undefined : doc.base64, 
          mimeType: doc.mimeType,
          filePath: doc.filePath 
        },
        history,
        brain,
        adaptiveContext
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      yield `AI Alert: Synthesis failed. ${errorData.error || "Quota threshold reached. Please wait a moment."}`;
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) return;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
  },

  /**
   * Proxies a tool generation request.
   */
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
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        task: 'generate-tool',
        toolType,
        userInput,
        doc: { 
          base64: doc.filePath ? undefined : doc.base64, 
          mimeType: doc.mimeType,
          filePath: doc.filePath 
        },
        brain,
        adaptiveContext
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      yield `AI Alert: Generation failed. ${errorData.error || "Rate limit reached for Flash model."}`;
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) return;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
  }
};
