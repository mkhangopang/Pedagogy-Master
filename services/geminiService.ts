
import { SLO, NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";
import { supabase } from "../lib/supabase";

function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

function parseAIError(raw: string): string {
  try {
    if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
      return "Neural Rate Limit: The free AI node is temporarily saturated. Please pause for 15 seconds.";
    }
    const parsed = JSON.parse(raw);
    return parsed.error?.message || "Synthesis interrupted. Please try again.";
  } catch (e) {
    return raw.length > 200 ? "Neural Sync Error: The document context is too complex for the current session." : raw;
  }
}

export const geminiService = {
  async getAuthToken(): Promise<string | undefined> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  },

  async speak(text: string) {
    const token = await this.getAuthToken();
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ task: 'tts', message: text.substring(0, 5000) })
    });
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Voice synth failed");
    }
    const { audioData } = await response.json();
    
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const buffer = await decodeAudioData(decodeBase64(audioData), ctx);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  },

  async *chatWithDocumentStream(
    message: string, 
    doc: { base64?: string; mimeType?: string; filePath?: string }, 
    history: { role: 'user' | 'assistant', content: string }[],
    brain: NeuralBrain,
    user?: UserProfile,
    useSearch: boolean = false
  ) {
    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, 'chat') : "";
    const token = await this.getAuthToken();

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        task: 'chat',
        message,
        doc: { base64: doc.filePath ? undefined : doc.base64, mimeType: doc.mimeType, filePath: doc.filePath },
        history,
        brain,
        adaptiveContext,
        useSearch
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      yield `AI Alert: ${parseAIError(errorData.error || "Connection timeout")}`;
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.includes('ERROR:RATE_LIMIT_HIT')) {
        yield "\n\n[System Notification: AI Node saturated. Cooling down...]";
        break;
      }
      yield chunk;
    }
  },

  async *generatePedagogicalToolStream(
    toolType: string,
    userInput: string,
    doc: { base64?: string; mimeType?: string; filePath?: string },
    brain: NeuralBrain,
    user?: UserProfile,
    useSearch: boolean = false
  ) {
    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, toolType) : "";
    const token = await this.getAuthToken();

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
        useSearch
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      yield `AI Alert: ${parseAIError(errorData.error || "Connection timeout")}`;
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.includes('ERROR:RATE_LIMIT_HIT')) {
        yield "\n\n[Neural Alert: Rate limit exceeded during streaming. Cooldown initiated.]";
        break;
      }
      yield chunk;
    }
  }
};
