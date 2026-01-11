import { GoogleGenAI } from "@google/genai";

export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docParts: any[] = []
): Promise<string> {
  // Support both standard and Vercel-specific API key names
  const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API Key missing (API_KEY or GEMINI_API_KEY)');

  const ai = new GoogleGenAI({ apiKey });
  
  // Model name selection per instructions
  const modelName = 'gemini-3-flash-preview';

  const contents: any[] = [];
  
  // Map history to Google GenAI format
  const processedHistory = history.slice(-6);
  let lastRole = '';
  
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

  // Ensure user is the last speaker in contents before sending
  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    const lastUserParts = contents[contents.length - 1].parts;
    lastUserParts.push({ text: "\n\nNEW_QUERY: " + fullPrompt });
    
    if (docParts && docParts.length > 0) {
      docParts.forEach(part => {
        if (part.inlineData) lastUserParts.unshift(part);
      });
    }
  } else {
    const parts: any[] = [];
    if (docParts && docParts.length > 0) {
      docParts.forEach(part => {
        if (part.inlineData) parts.push(part);
      });
    }
    parts.push({ text: fullPrompt });
    contents.push({ role: 'user', parts });
  }

  const response = await ai.models.generateContent({
    model: modelName, 
    contents,
    config: { 
      systemInstruction: systemInstruction, 
      temperature: hasDocuments ? 0.1 : 0.7,
      topK: 40,
      topP: 0.95
    }
  });

  return response.text || "Synthesis error: No response text returned.";
}
