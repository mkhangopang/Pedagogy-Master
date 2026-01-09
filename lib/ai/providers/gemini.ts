
import { GoogleGenAI } from "@google/genai";

export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docPart?: any
): Promise<string> {
  const geminiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('Gemini API Key missing');

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  
  const finalSystem = hasDocuments 
    ? `STRICT CURRICULUM GROUNDING: You are analyzing curriculum files. Use ONLY the provided content. Disregard general knowledge for specific SLO/standard codes. Temperature is 0.0.`
    : systemInstruction;

  const contents: any[] = history.slice(-3).map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));

  const currentParts: any[] = [{ text: fullPrompt }];
  if (docPart) {
    currentParts.unshift(docPart);
  }
  
  contents.push({ role: 'user', parts: currentParts });

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite-latest',
    contents,
    config: { 
      systemInstruction: finalSystem, 
      temperature: 0.0, // FORCED DETERMINISM
      topK: 1,
      topP: 1
    }
  });

  return result.text || "Synthesis node failed to generate a response.";
}
