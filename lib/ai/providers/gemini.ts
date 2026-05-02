import { GoogleGenAI, Modality } from "@google/genai";

/**
 * NEURAL GEMINI ADAPTER (v52.0)
 *
 * FIX-CRITICAL-01: Replaced non-existent model names.
 *   WRONG: 'gemini-3-pro-preview', 'gemini-3-flash-preview' (do not exist)
 *   CORRECT:
 *     'gemini-2.5-pro-preview-05-06'        — complex reasoning
 *     'gemini-2.0-flash'                     — fast tasks (default)
 *     'gemini-2.0-flash-lite'                — high-volume fallback
 *     'gemini-2.0-flash-preview-image-generation' — vision/image
 *
 * FIX-02: apiKey now reads API_KEY || GEMINI_API_KEY (matches resolveApiKey())
 */

function resolveGeminiKey(): string {
  const key = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  if (!key) throw new Error('[Gemini] API key not found. Set API_KEY or GEMINI_API_KEY.');
  return key;
}

export async function callGemini(
  fullPrompt: string,
  history: any[],
  systemInstruction: string,
  hasDocuments: boolean = false,
  docParts: any[] = [],
  forceImageModel: boolean = false
): Promise<{ text?: string; imageUrl?: string; groundingMetadata?: any }> {
  const apiKey = resolveGeminiKey();
  const ai = new GoogleGenAI({ apiKey });

  if (forceImageModel || systemInstruction.includes('IMAGE_GENERATION_MODE')) {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });
    const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (part?.inlineData) {
      return { imageUrl: `data:image/png;base64,${part.inlineData.data}`, text: 'Visual synthesis complete.' };
    }
    throw new Error('[Gemini] Vision node failed to return image data.');
  }

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

    const isMassiveTask = fullPrompt.includes('CURRICULUM') && (fullPrompt.includes('SINDH') || fullPrompt.includes('FEDERAL') || fullPrompt.includes('MASTER MD'));
    return await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: systemInstruction || 'You are a world-class pedagogy master.',
        temperature: isMassiveTask ? 0.1 : 0.7,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: isMassiveTask ? 4096 : 2048 },
      },
    });
  };

  const isComplex = fullPrompt.includes('LESSON PLAN') || fullPrompt.includes('CURRICULUM') || fullPrompt.length > 5000;
  const primaryModel = isComplex ? 'gemini-2.5-pro-preview-05-06' : 'gemini-2.0-flash';

  try {
    const response = await executeWithModel(primaryModel);
    return { text: response.text || 'Synthesis complete.', groundingMetadata: response.candidates?.[0]?.groundingMetadata };
  } catch (err: any) {
    console.warn(`[Gemini] ${primaryModel} failed (${err.message}). Falling back to gemini-2.0-flash-lite...`);
    const response = await executeWithModel('gemini-2.0-flash-lite');
    return { text: response.text || 'Synthesis complete.' };
  }
}

export async function streamGemini(
  fullPrompt: string,
  history: any[],
  systemInstruction: string,
  onToken: (token: string) => void
): Promise<{ fullText: string; model: string }> {
  const apiKey = resolveGeminiKey();
  const ai = new GoogleGenAI({ apiKey });
  const isComplex = fullPrompt.length > 5000;
  const model = isComplex ? 'gemini-2.5-pro-preview-05-06' : 'gemini-2.0-flash';
  const contents: any[] = history.slice(-4).map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] }));
  contents.push({ role: 'user', parts: [{ text: fullPrompt }] });
  let fullText = '';
  try {
    const response = await ai.models.generateContentStream({ model, contents, config: { systemInstruction, temperature: 0.7, maxOutputTokens: 8192 } });
    for await (const chunk of response) {
      const token = chunk.text ?? '';
      if (token) { fullText += token; onToken(token); }
    }
    return { fullText, model };
  } catch (err: any) {
    console.warn(`[Gemini Stream] ${model} failed. Non-streaming fallback.`);
    const fallback = await ai.models.generateContent({ model: 'gemini-2.0-flash-lite', contents, config: { systemInstruction, temperature: 0.7 } });
    const text = fallback.text || '';
    onToken(text);
    return { fullText: text, model: 'gemini-2.0-flash-lite' };
  }
}
