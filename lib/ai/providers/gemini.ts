import { GoogleGenAI } from "@google/genai";

export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docParts: any[] = []
): Promise<string> {
  // Exhaustive search for the API key across all possible naming conventions
  const apiKey = 
    process.env.AI_GATWAY_API_KEY || 
    (process.env as any).AI_GATWAY_API_KEY ||
    process.env.API_KEY || 
    (process.env as any).GEMINI_API_KEY ||
    (window as any).AI_GATWAY_API_KEY ||
    (window as any).API_KEY;

  if (!apiKey) throw new Error('Synthesis failure: Gemini API Key missing (Checked: AI_GATWAY_API_KEY, API_KEY, GEMINI_API_KEY)');

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