import { GoogleGenAI } from "@google/genai";

export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docParts: any[] = []
): Promise<string> {
  const geminiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('Gemini API Key missing');

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  
  // STRICT GROUNDING PROTOCOL
  // We prioritize the asset vault when documents are present
  const finalSystem = hasDocuments 
    ? `### ROLE: CURRICULUM_INTELLIGENCE_NODE
### MANDATE: STRICT_GROUNDING
1. You are LOCKED to the provided <ASSET_VAULT_INTELLIGENCE> and <RAW_EXTRACTS>.
2. Respond based ONLY on the selected curriculum assets. 
3. If information is not in the vault, state: "DATA_UNAVAILABLE: This objective/topic is not present in your current curriculum library."
4. DO NOT use external pedagogical training for curriculum-specific lookups.
5. Formatting: Use 1. and 1.1 headings. NO BOLD HEADINGS.
6. Reference files by name.

${systemInstruction}`
    : systemInstruction;

  const contents: any[] = [];
  
  // Clean history for token efficiency
  let lastRole = 'model';
  const processedHistory = history.slice(-6);
  
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

  if (lastRole === 'user') {
    contents.pop();
  }

  const currentParts: any[] = [];
  
  // Multimodal Ingestion
  if (docParts && docParts.length > 0) {
    docParts.forEach(part => {
      if (part.inlineData) {
        currentParts.push(part);
      }
    });
  }
  
  currentParts.push({ text: fullPrompt });
  contents.push({ role: 'user', parts: currentParts });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview', 
    contents,
    config: { 
      systemInstruction: finalSystem, 
      temperature: hasDocuments ? 0.0 : 0.7, // Zero temperature for strict grounding
      topK: 1,
      topP: 1,
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  return response.text || "Synthesis node timed out.";
}