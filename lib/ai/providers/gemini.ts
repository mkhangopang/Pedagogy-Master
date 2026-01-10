
import { GoogleGenAI } from "@google/genai";

export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docPart?: any
): Promise<string> {
  // Exclusively use process.env.API_KEY as per instructions
  const geminiKey = process.env.API_KEY;
  if (!geminiKey) throw new Error('Gemini API Key missing (Verify process.env.API_KEY)');

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  
  // High-priority grounding instructions
  const finalSystem = hasDocuments 
    ? `STRICT_CURRICULUM_ANALYZER_ACTIVE: Use ONLY the <ASSET_VAULT> provided in the user message. 
       Ignore all general training. Do not search the web. 
       If information is not in the vault, reply: "DATA_UNAVAILABLE: [topic] not found in uploaded curriculum documents."
       Formatting: Use numbered headers (1., 1.1). DO NOT USE BOLD HEADINGS.`
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
      temperature: hasDocuments ? 0.0 : 0.7, 
      topK: 1,
      topP: 1
    }
  });

  return response.text || "Neural node failed to synthesize response.";
}
