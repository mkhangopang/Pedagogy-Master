
import { GoogleGenAI } from "@google/genai";

export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docPart?: any
): Promise<string> {
  const geminiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('Gemini API Key missing (Verify process.env.API_KEY or process.env.GEMINI_API_KEY)');

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  
  // Enhanced dynamic instructions
  const finalSystem = hasDocuments 
    ? `STRICT_CURRICULUM_ANALYZER_ACTIVE: You are grounded in the <ASSET_VAULT>. 
       Use ONLY provided curriculum text or multimodal input. 
       Ignore general knowledge. If information is missing, say DATA_UNAVAILABLE.
       Formatting: Numbered headers (1., 1.1). NO BOLD HEADINGS.`
    : systemInstruction;

  const contents: any[] = [];
  
  // Map history to standard Gemini parts
  history.slice(-3).forEach(h => {
    contents.push({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }]
    });
  });

  const currentParts: any[] = [];
  // Native multimodal support: Gemini parses the PDF/Image bytes directly if available
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
