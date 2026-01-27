import { GoogleGenAI, Modality } from "@google/genai";

/**
 * WORLD-CLASS GEMINI ADAPTER (v42.0)
 * Optimized for Pedagogy Master Logic with strict null-safety and high-fidelity reasoning.
 */
export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docParts: any[] = [],
  forceImageModel: boolean = false
): Promise<{ text?: string; imageUrl?: string; groundingMetadata?: any }> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // IMAGE SYNTHESIS NODE
    if (forceImageModel || systemInstruction.includes('IMAGE_GENERATION_MODE')) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        config: {
          imageConfig: { aspectRatio: "1:1" }
        }
      });

      const candidate = response.candidates?.[0];
      const part = candidate?.content?.parts?.find(p => p.inlineData);
      
      if (part?.inlineData) {
        return { 
          imageUrl: `data:image/png;base64,${part.inlineData.data}`,
          text: "Visual synthesis complete."
        };
      }
      throw new Error("Vision node failed to produce data.");
    }

    // PEDAGOGICAL REASONING NODE
    const isComplex = fullPrompt.includes('LESSON PLAN') || fullPrompt.length > 5000;
    const model = isComplex ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

    const contents: any[] = [];
    // Include minimal relevant history
    history.slice(-4).forEach(h => {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      });
    });

    const parts: any[] = [];
    // Inject document snippets if provided
    if (docParts && docParts.length > 0) {
      docParts.forEach(p => { if (p.inlineData) parts.push(p); });
    }
    parts.push({ text: fullPrompt });
    contents.push({ role: 'user', parts });

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemInstruction || "You are a world-class pedagogy master.",
        temperature: hasDocuments ? 0.1 : 0.7,
        // High thinking budget for complex lesson plan architecture
        thinkingConfig: isComplex ? { thinkingBudget: 4000 } : { thinkingBudget: 0 }
      }
    });

    if (!response.candidates?.[0]) {
      throw new Error("Neural response was empty. Grid segment reset required.");
    }

    return { 
      text: response.text || "Synthesis complete.",
      groundingMetadata: response.candidates[0].groundingMetadata 
    };
  } catch (error: any) {
    console.error("❌ [Gemini Grid Error]:", error.message);
    throw error;
  }
}