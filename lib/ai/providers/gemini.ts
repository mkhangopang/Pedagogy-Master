
import { GoogleGenAI } from "@google/genai";

export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docPart?: any
): Promise<string> {
  // Use API_KEY as primary per instructions
  const geminiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('Gemini API Key missing (API_KEY required)');

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  
  const finalSystem = hasDocuments 
    ? `STRICT_CURRICULUM_ANALYZER: Ground your responses EXCLUSIVELY in the provided <ASSET_VAULT>. 
       Do not use general training. If data is missing from vault, say DATA_UNAVAILABLE.
       Formatting: Numbered headers (1., 1.1). NO BOLD HEADINGS.`
    : systemInstruction;

  const contents: any[] = [];
  
  // Minimal history for edge speed
  history.slice(-3).forEach(h => {
    contents.push({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }]
    });
  });

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
      topP: 1,
      thinkingConfig: { thinkingBudget: 0 } // High-speed synthesis mode
    }
  });

  return response.text || "Neural node failed to synthesize response.";
}
