import { SLO, NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";

/**
 * GOOGLE GENERATIVE AI SERVICE
 * Bridge for communicating with the server-side AI processing engine.
 */
export const geminiService = {
  /**
   * Triggers high-speed structural analysis for learning outcome extraction.
   */
  async generateSLOTagsFromBase64(
    base64Data: string, 
    mimeType: string, 
    brain: NeuralBrain,
    user?: UserProfile
  ): Promise<SLO[]> {
    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, 'extraction') : "";

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'extract-slos',
        doc: { base64: base64Data, mimeType },
        brain,
        adaptiveContext
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Server-side extraction failed.');
    }

    const data = await response.json();
    return data.text ? JSON.parse(data.text) : [];
  },

  /**
   * Connects to the server-side streaming engine for pedagogical conversation.
   */
  async *chatWithDocumentStream(
    message: string, 
    doc: { base64?: string; mimeType?: string }, 
    history: { role: 'user' | 'assistant', content: string }[],
    brain: NeuralBrain,
    user?: UserProfile
  ) {
    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, 'chat') : "";

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'chat',
        message,
        doc,
        history,
        brain,
        adaptiveContext
      })
    });

    if (!response.ok) {
      yield "Engine Update: The generative AI model is temporarily unavailable.";
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
   * Connects to the server-side streaming engine for teaching material synthesis.
   */
  async *generatePedagogicalToolStream(
    toolType: string,
    userInput: string,
    doc: { base64?: string; mimeType?: string },
    brain: NeuralBrain,
    user?: UserProfile
  ) {
    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, toolType) : "";

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'generate-tool',
        toolType,
        userInput,
        doc,
        brain,
        adaptiveContext
      })
    });

    if (!response.ok) {
      yield "Engine Update: Tool synthesis interrupted. Please check document context.";
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