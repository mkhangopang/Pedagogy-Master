import { GoogleGenAI, Modality } from "@google/genai";

/**
 * HIGH-FIDELITY GEMINI ADAPTER (v31.2)
 * Updated to enforce guidelines regarding thinkingConfig and maxOutputTokens.
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
    
    // IMAGE MODEL SELECTION
    if (forceImageModel) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        config: {
          imageConfig: { aspectRatio: "16:9" }
        }
      });

      const candidates = response.candidates;
      if (candidates && candidates.length > 0 && candidates[0].content?.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.inlineData) {
            return { imageUrl: `data:image/png;base64,${part.inlineData.data}` };
          }
        }
      }
      throw new Error("Neural vision node failed to synthesize image bytes.");
    }

    // STANDARD TEXT/REASONING MODEL
    const isComplexTask = fullPrompt.includes('LESSON PLAN') || 
                         fullPrompt.includes('ASSESSMENT') || 
                         fullPrompt.includes('RUBRIC') ||
                         fullPrompt.length > 8000;
    
    const modelName = isComplexTask ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

    const contents: any[] = [];
    history.slice(-6).forEach(h => {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      });
    });

    const currentParts: any[] = [];
    if (docParts && docParts.length > 0) {
      docParts.forEach(part => { if (part.inlineData) currentParts.push(part); });
    }
    currentParts.push({ text: fullPrompt });
    contents.push({ role: 'user', parts: currentParts });

    const config: any = {
      systemInstruction: systemInstruction || "You are a world-class pedagogical assistant.",
      temperature: hasDocuments ? 0.1 : 0.7,
      // GUIDELINE: When setting thinkingBudget, also set maxOutputTokens.
      maxOutputTokens: isComplexTask ? 8192 : 4096,
      thinkingConfig: isComplexTask ? { thinkingBudget: 4000 } : { thinkingBudget: 0 }
    };

    if (modelName === 'gemini-3-pro-preview' && (fullPrompt.includes('research') || fullPrompt.includes('latest'))) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config
    });

    return { 
      text: response.text || "Synthesis interrupted.",
      groundingMetadata: response.candidates?.[0]?.groundingMetadata 
    };
  } catch (error: any) {
    console.error("❌ [Gemini Node] Error:", error.message);
    throw error;
  }
}