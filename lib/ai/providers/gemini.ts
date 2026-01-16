import { GoogleGenAI } from "@google/genai";
import { resolveApiKey } from "../../env-server";

export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docParts: any[] = []
): Promise<string> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    console.error("❌ [Gemini Node] Missing API Key");
    throw new Error('Neural Node Error: Gemini API key is missing.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const modelName = 'gemini-3-flash-preview';

    // Build contents array for multi-turn
    const contents: any[] = [];
    const processedHistory = history.slice(-6);
    
    processedHistory.forEach(h => {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      });
    });

    // Final prompt parts
    const currentParts: any[] = [];
    if (docParts && docParts.length > 0) {
      docParts.forEach(part => {
        if (part.inlineData) currentParts.push(part);
      });
    }
    currentParts.push({ text: fullPrompt });

    // Ensure we follow user-model-user pattern
    if (contents.length === 0 || contents[contents.length - 1].role === 'model') {
      contents.push({ role: 'user', parts: currentParts });
    } else {
      contents[contents.length - 1].parts.push(...currentParts);
    }

    console.log(`📡 [Gemini Node] Dispatching to ${modelName}.`);

    const result = await ai.models.generateContent({
      model: modelName, 
      contents,
      config: { 
        systemInstruction: systemInstruction || "You are a pedagogical assistant.", 
        temperature: hasDocuments ? 0.1 : 0.7,
        topK: 40,
        topP: 0.95
      }
    });

    if (!result || !result.text) {
      const candidate = (result as any).candidates?.[0];
      if (candidate?.finishReason === 'SAFETY') {
        return "🛡️ AI Synthesis Blocked: Content triggered safety filters.";
      }
      return "Synthesis error: Remote node returned empty response. Check curriculum tags.";
    }

    return result.text;
  } catch (error: any) {
    console.error("❌ [Gemini Node] Exception:", error.message);
    throw error;
  }
}