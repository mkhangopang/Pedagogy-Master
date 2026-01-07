
import { GoogleGenAI } from "@google/genai";

export async function callGemini(prompt: string, history: any[], systemInstruction: string, docPart?: any): Promise<string> {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const ai = new GoogleGenAI({ apiKey });
  
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

  return result.text || "No response generated.";
}
