
import { GoogleGenAI } from "@google/genai";

export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docParts: any[] = []
): Promise<string> {
  // Support both standard API_KEY and Vercel-specific GEMINI_API_KEY
  const geminiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('Gemini API Key missing (process.env.API_KEY or GEMINI_API_KEY required)');

  // MANDATORY: Create instance right before API call
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  
  const finalSystem = hasDocuments 
    ? `STRICT_CURRICULUM_ANALYZER: Ground your responses EXCLUSIVELY in the provided <ASSET_VAULT>. 
       Do not use general training. If data is missing from vault, say DATA_UNAVAILABLE.
       Formatting: Numbered headers (1., 1.1). NO BOLD HEADINGS.`
    : systemInstruction;

  const contents: any[] = [];
  
  /**
   * ROLE ALTERNATION LOGIC
   * Gemini requires alternating 'user' and 'model' roles.
   * We ensure the sequence ends with a 'model' turn before adding the current 'user' message.
   */
  let lastRole = 'model'; // Initial state assuming first turn will be user
  const processedHistory = history.slice(-6); // Limit history for speed/cost
  
  processedHistory.forEach(h => {
    const role = h.role === 'user' ? 'user' : 'model';
    if (role !== lastRole) {
      contents.push({
        role,
        parts: [{ text: h.content }]
      });
      lastRole = role;
    }
  });

  // If the last history message was a user message, we remove it to allow the new prompt
  if (lastRole === 'user') {
    contents.pop();
  }

  const currentParts: any[] = [];
  
  // Support multiple documents (multimodal)
  if (docParts && docParts.length > 0) {
    docParts.forEach(part => {
      if (part.inlineData) {
        currentParts.push(part);
      }
    });
  }
  
  currentParts.push({ text: fullPrompt });
  
  contents.push({ role: 'user', parts: currentParts });

  // Use recommended gemini-3-flash-preview for speed and efficiency
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

  // Use property access for .text
  return response.text || "Neural node failed to synthesize response.";
}
