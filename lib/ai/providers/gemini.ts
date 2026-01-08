
import { GoogleGenAI } from "@google/genai";

export async function callGemini(prompt: string, history: any[], systemInstruction: string, docPart?: any): Promise<string> {
  // Check for standard key or common alias used in Vercel environments
  const geminiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('Gemini API Key missing (Checked API_KEY and GEMINI_API_KEY)');

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  
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
