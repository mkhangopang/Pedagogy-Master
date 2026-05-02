import { GoogleGenAI, Modality } from "@google/genai";

/**
 * NEURAL GEMINI ADAPTER (v51.0)
 * Optimized for Recursive Synthesis and Massive Multi-Grade Curriculum Artifacts.
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

    // Check for massive tasks based on structural keywords rather than specific subjects
    const isMassiveTask = fullPrompt.includes('CURRICULUM') && (fullPrompt.includes('SINDH') || fullPrompt.includes('FEDERAL') || fullPrompt.includes('MASTER MD'));
    
    return await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: systemInstruction || "You are a world-class pedagogy master.",
        temperature: isMassiveTask ? 0.1 : 0.7,
        maxOutputTokens: 8192, 
        thinkingConfig: { 
          thinkingBudget: isMassiveTask ? 4096 : 2048 
        }
      }
    });
  };

  const isComplex = fullPrompt.includes('LESSON PLAN') || fullPrompt.includes('CURRICULUM') || fullPrompt.length > 5000;
  
  const model = isComplex ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
  const response = await executeWithModel(model);
  return { text: response.text || "Synthesis complete.", groundingMetadata: response.candidates?.[0]?.groundingMetadata };
}