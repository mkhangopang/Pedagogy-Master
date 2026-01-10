
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
    ? `STRICT_CURRICULUM_ANALYZER: Ground your responses EXCLUSIVELY in the <ASSET_VAULT>. 
       Use ONLY provided text. Ignore general training. 
       Format using numbered headers (1., 1.1). NO BOLD HEADINGS.`
    : systemInstruction;

  const contents: any[] = [];
  
  // Keep history minimal to stay within edge function limits
  history.slice(-2).forEach(h => {
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
    model: 'gemini-3-flash-preview', // Using Flash for speed to avoid timeouts
    contents,
    config: { 
      systemInstruction: finalSystem, 
      temperature: hasDocuments ? 0.0 : 0.7,
      thinkingConfig: { thinkingBudget: 0 } // Disable thinking for extraction/speed
    }
  });

  return response.text || "Neural node failed to synthesize response.";
}
