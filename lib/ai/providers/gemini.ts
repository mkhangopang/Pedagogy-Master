
import { GoogleGenAI } from "@google/genai";

export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docPart?: any
): Promise<string> {
  const geminiKey = process.env.API_KEY;
  if (!geminiKey) throw new Error('Gemini API Key missing (Checked process.env.API_KEY)');

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  
  // Strict system instructions for grounding
  const finalSystem = hasDocuments 
    ? `ABSOLUTE_GROUNDING_ACTIVE: You are a specialized curriculum analyzer. 
       Ignore your internal knowledge. Use ONLY the text in the provided vault. 
       Temperature 0.0 for precision. Do not search web.`
    : systemInstruction;

  const contents: any[] = history.slice(-3).map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));

  const currentParts: any[] = [];
  if (docPart) {
    currentParts.push(docPart);
  }
  currentParts.push({ text: fullPrompt });
  
  contents.push({ role: 'user', parts: currentParts });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents,
    config: { 
      systemInstruction: finalSystem, 
      temperature: hasDocuments ? 0 : 0.7, 
      topK: 1,
      topP: 1
    }
  });

  return response.text || "Neural node failed to synthesize response.";
}
