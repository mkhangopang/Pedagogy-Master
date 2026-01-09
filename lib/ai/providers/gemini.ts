
import { GoogleGenAI } from "@google/genai";

export async function callGemini(
  prompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docPart?: any
): Promise<string> {
  const geminiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('Gemini API Key missing');

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  
  const finalSystem = hasDocuments 
    ? `CURRICULUM MODE: You have been provided with curriculum source files. Your response MUST be strictly aligned with these files. Ignore general training data that contradicts them. ${systemInstruction}`
    : systemInstruction;

  const contents: any[] = history.slice(-3).map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));

  const currentParts: any[] = [{ text: prompt }];
  if (docPart) currentParts.unshift(docPart);
  
  contents.push({ role: 'user', parts: currentParts });

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite-latest', // High speed, high context
    contents,
    config: { 
      systemInstruction: finalSystem, 
      temperature: 0.1, // Forced grounding
      topK: 1,
      topP: 1
    }
  });

  return result.text || "No response generated.";
}
