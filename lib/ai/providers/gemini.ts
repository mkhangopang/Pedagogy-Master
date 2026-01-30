import { GoogleGenAI, Modality } from "@google/genai";

/**
 * NEURAL GEMINI ADAPTER (v46.0)
 * Optimized for Recursive Synthesis and Massive Curriculum Artifacts.
 */
export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docParts: any[] = [],
  forceImageModel: boolean = false
): Promise<{ text?: string; imageUrl?: string; groundingMetadata?: any }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 1. Vision Node
  if (forceImageModel || systemInstruction.includes('IMAGE_GENERATION_MODE')) {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      config: { imageConfig: { aspectRatio: "1:1" } }
    });
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part?.inlineData) return { imageUrl: `data:image/png;base64,${part.inlineData.data}`, text: "Visual synthesis complete." };
    throw new Error("Vision node failed.");
  }

  // 2. Reasoning Node with Max Output Scaling
  const executeWithModel = async (modelName: string) => {
    const contents: any[] = [];
    history.slice(-4).forEach(h => {
      contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] });
    });

    const parts: any[] = [];
    if (docParts && docParts.length > 0) {
      docParts.forEach(p => { if (p.inlineData) parts.push(p); });
    }
    parts.push({ text: fullPrompt });
    contents.push({ role: 'user', parts });

    // RECURSIVE SYNERGY: Detect if this is a massive merge/reduction task
    const isMassiveTask = fullPrompt.includes('MASTER SINDH BIOLOGY 2024') || fullPrompt.includes('Tier_Merge');
    
    return await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: systemInstruction || "You are a world-class pedagogy master.",
        temperature: isMassiveTask ? 0.05 : 0.7, // Near-zero temp for data integrity
        // CRITICAL: Maximize output tokens for 185-page curriculum reduction
        maxOutputTokens: isMassiveTask ? 8192 : 4096,
        thinkingConfig: { 
          // Reserve tokens for final result to prevent truncation at Domain F
          thinkingBudget: isMassiveTask ? 1024 : 2048 
        }
      }
    });
  };

  const isComplex = fullPrompt.includes('LESSON PLAN') || fullPrompt.includes('MASTER SINDH BIOLOGY') || fullPrompt.length > 5000;
  
  try {
    const model = isComplex ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
    const response = await executeWithModel(model);
    return { text: response.text || "Synthesis complete.", groundingMetadata: response.candidates?.[0]?.groundingMetadata };
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted')) {
      console.warn(`🔄 [Gemini Failover] Pro saturated. Engaging Flash Node...`);
      const fallbackResponse = await executeWithModel('gemini-3-flash-preview');
      return { text: fallbackResponse.text || "Synthesis complete (via Flash).", groundingMetadata: fallbackResponse.candidates?.[0]?.groundingMetadata };
    }
    throw error;
  }
}
