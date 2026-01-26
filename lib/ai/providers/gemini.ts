import { GoogleGenAI, Modality } from "@google/genai";

/**
 * HIGH-FIDELITY GEMINI ADAPTER (v32.0)
 * Optimized for Multimodal synthesis and Search Grounding.
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
    
    // IMAGE MODEL SELECTION (Nano Banana Node)
    if (forceImageModel) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        config: {
          imageConfig: { aspectRatio: "1:1" }
        }
      });

      if (response.candidates && response.candidates.length > 0) {
        const parts = response.candidates[0].content?.parts || [];
        for (const part of parts) {
          if (part.inlineData) {
            return { imageUrl: `data:image/png;base64,${part.inlineData.data}` };
          }
        }
      }
      throw new Error("Neural vision node failure.");
    }

    // STANDARD TEXT/REASONING MODEL
    const isComplexTask = fullPrompt.includes('LESSON PLAN') || 
                         fullPrompt.includes('ASSESSMENT') || 
                         fullPrompt.includes('RUBRIC') ||
                         fullPrompt.length > 8000;
    
    // Use Flash for high throughput, Pro for deep reasoning
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
      maxOutputTokens: isComplexTask ? 8192 : 4096,
      thinkingConfig: isComplexTask ? { thinkingBudget: 4000 } : { thinkingBudget: 0 }
    };

    // ENABLE SEARCH GROUNDING for Visual Aids or Research
    const needsSearch = fullPrompt.includes('RESOURCE PROTOCOL') || 
                        fullPrompt.includes('research') || 
                        fullPrompt.includes('clickable links');
                        
    if (needsSearch) {
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