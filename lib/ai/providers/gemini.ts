
import { GoogleGenAI } from "@google/genai";

export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docPart?: any
): Promise<string> {
  // Respecting Vercel environment variable naming while maintaining SDK standards
  const geminiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('Gemini API Key missing (Verify API_KEY in environment)');

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  
  // High-priority grounding instructions passed as systemInstruction
  const finalSystem = hasDocuments 
    ? `STRICT_CURRICULUM_ANALYZER_ACTIVE: Use ONLY the <ASSET_VAULT> text provided in the user message. 
       Ignore your general training. Do not search the web. 
       If information is missing from the vault, reply: "DATA_UNAVAILABLE: [topic] not found in uploaded curriculum assets."
       Strict formatting: Numbered headers (1., 1.1). No bold headings.`
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
      temperature: hasDocuments ? 0.0 : 0.7, // Zero temperature for document extraction
      topK: 1,
      topP: 1
    }
  });

  return response.text || "Neural node failed to synthesize response.";
}
