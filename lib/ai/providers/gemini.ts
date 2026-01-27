import { GoogleGenAI, Modality } from "@google/genai";

/**
 * WORLD-CLASS GEMINI ADAPTER (v40.0)
 * Optimized for Pedagogy Master Logic.
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

      const part = response.candidates[0].content.parts.find(p => p.inlineData);
      if (part?.inlineData) {
        return { 
          imageUrl: `data:image/png;base64,${part.inlineData.data}`,
          text: "Visual synthesis complete."
        };
      }
      throw new Error("Vision node failed to produce data.");
    }

    // PEDAGOGICAL REASONING NODE
    const isComplex = fullPrompt.includes('LESSON PLAN') || fullPrompt.length > 6000;
    const model = isComplex ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

    const contents: any[] = [];
    history.slice(-4).forEach(h => {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      });
    });

    const parts: any[] = [];
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
        temperature: hasDocuments ? 0.15 : 0.7,
        thinkingConfig: isComplex ? { thinkingBudget: 4000 } : { thinkingBudget: 0 }
      }
    });

    return { 
      text: response.text,
      groundingMetadata: response.candidates?.[0]?.groundingMetadata 
    };
  } catch (error: any) {
    console.error("❌ [Gemini Grid Error]:", error.message);
    throw error;
  }
}