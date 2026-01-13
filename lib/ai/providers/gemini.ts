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
  if (!apiKey) throw new Error('Neural Node Error: Gemini API key is missing.');

  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'gemini-3-flash-preview';

  const contents: any[] = [];
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

  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    const lastUserParts = contents[contents.length - 1].parts;
    lastUserParts.push({ text: "\n\nNEW_QUERY: " + fullPrompt });
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

  const response = await ai.models.generateContent({
    model: modelName, 
    contents,
    config: { 
      systemInstruction, 
      temperature: hasDocuments ? 0.1 : 0.7,
      topK: 40,
      topP: 0.95
    }
  });

  return response.text || "Synthesis error: Remote node returned empty response.";
}