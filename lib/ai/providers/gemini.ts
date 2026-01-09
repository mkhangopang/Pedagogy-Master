
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
  
  // High-intensity grounding instruction
  const finalSystem = hasDocuments 
    ? `STRICT_DOCUMENT_GROUNDING: You are a processor for private curriculum files. 
       Ignore your pre-training knowledge of specific standards. 
       Use ONLY the text in the provided <CURRICULUM_VAULT>. 
       If a code is missing from the vault, explicitly state it is not there.`
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
      temperature: hasDocuments ? 0.0 : 0.2, // Locked for facts
      topK: 1,
      topP: 1
    }
  });

  return result.text || "Neural node failed to generate response.";
}
