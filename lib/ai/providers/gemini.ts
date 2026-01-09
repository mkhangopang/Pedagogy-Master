
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
  
  // Use aggressive grounding instructions for the Gemini system channel
  const finalSystem = hasDocuments 
    ? `ABSOLUTE_GROUNDING_ACTIVE: You are a specialized curriculum analyzer. 
       Ignore your internal knowledge about education codes. 
       Use ONLY the text in the <ASSET_VAULT> provided in the prompt. 
       Temperature is locked to 0.0 for maximum precision.`
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
    model: 'gemini-3-flash-preview',
    contents,
    config: { 
      systemInstruction: finalSystem, 
      temperature: hasDocuments ? 0.0 : 0.4, 
      topK: 1,
      topP: 1
    }
  });

  return result.text || "Neural node failed to synthesize response.";
}
