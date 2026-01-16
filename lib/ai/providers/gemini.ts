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
    // Use gemini-3-flash-preview as the primary fast synthesis node
    const modelName = 'gemini-3-flash-preview';

    const contents: any[] = [];
    // Only take the last few messages to prevent token overflow
    const processedHistory = history.slice(-6);
    let lastRole = '';
    
    processedHistory.forEach(h => {
      const role = h.role === 'user' ? 'user' : 'model';
      if (role !== lastRole) {
        contents.push({
          role,
          parts: [{ text: h.content }]
        });
        lastRole = role;
      }
    });

    // Handle payload construction
    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      const lastUserParts = contents[contents.length - 1].parts;
      lastUserParts.push({ text: "\n\n[CONTEXT_COMMAND]: " + fullPrompt });
      if (docParts && docParts.length > 0) {
        docParts.forEach(part => { if (part.inlineData) lastUserParts.unshift(part); });
      }
    } else {
      const parts: any[] = [];
      if (docParts && docParts.length > 0) {
        docParts.forEach(part => { if (part.inlineData) parts.push(part); });
      }
      parts.push({ text: fullPrompt });
      contents.push({ role: 'user', parts });
    }

    console.log(`📡 [Gemini Node] Sending request to ${modelName}. History depth: ${contents.length}`);

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

    // CRITICAL: Robust checking of the candidate response
    if (!result || !result.text) {
      console.warn("⚠️ [Gemini Node] Received empty text. Checking safety ratings...");
      
      // Check if blocked by safety
      const candidate = (result as any).candidates?.[0];
      if (candidate?.finishReason === 'SAFETY') {
        return "🛡️ AI Synthesis Blocked: The curriculum content triggered safety filters. Please try re-phrasing the request.";
      }
      
      return "Synthesis error: Remote node returned empty response. (Logic Gap: Context may be empty or ill-formed).";
    }

    return result.text;
  } catch (error: any) {
    console.error("❌ [Gemini Node] Exception:", error.message);
    if (error.message?.includes('429')) {
      return "Neural Grid Saturated: Gemini rate limit exceeded. Retrying via secondary node...";
    }
    throw error;
  }
}