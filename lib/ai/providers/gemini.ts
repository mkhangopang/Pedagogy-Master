
import { GoogleGenAI } from "@google/genai";

export async function callGemini(prompt: string, history: any[], systemInstruction: string, docPart?: any): Promise<string> {
  const geminiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('Gemini API Key missing (Checked API_KEY and GEMINI_API_KEY)');

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  
  const contents = history.slice(-4).map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));

  const currentParts: any[] = [{ text: prompt }];
  // Gemini uses docPart for multimodal (raw file) processing
  if (docPart) currentParts.unshift(docPart);
  
  contents.push({ role: 'user', parts: currentParts });

  const result = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents,
    config: { 
      systemInstruction, 
      temperature: 0.7,
      topK: 40,
      topP: 0.95
    }
  });

  return result.text || "No response generated.";
}
