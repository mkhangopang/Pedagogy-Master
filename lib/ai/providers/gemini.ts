
import { GoogleGenAI } from "@google/genai";

export async function callGemini(prompt: string, history: any[], systemInstruction: string, docPart?: any): Promise<string> {
  // Always use process.env.API_KEY for initializing the client
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const contents = history.slice(-4).map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));

  const currentParts: any[] = [{ text: prompt }];
  if (docPart) currentParts.unshift(docPart);
  contents.push({ role: 'user', parts: currentParts });

  const result = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents,
    config: { systemInstruction, temperature: 0.7 }
  });

  // Access the text property directly on GenerateContentResponse
  return result.text || "No response generated.";
}
