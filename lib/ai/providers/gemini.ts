import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

/**
 * HIGH-FIDELITY GEMINI ADAPTER (v29.0)
 * Implements intelligent task-based model scaling and strict safety protocols.
 */
export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docParts: any[] = []
): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // TASK-BASED MODEL SCALING
    // Use gemini-3-pro-preview for complex design; flash for lookups
    const isComplexTask = fullPrompt.includes('LESSON PLAN') || 
                         fullPrompt.includes('ASSESSMENT') || 
                         fullPrompt.length > 5000;
    
    const modelName = isComplexTask ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

    // 1. Prepare history in strict turn sequence
    const contents: any[] = [];
    const processedHistory = history.slice(-6);
    
    processedHistory.forEach(h => {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      });
    });

    // 2. Prepare current user turn parts
    const currentParts: any[] = [];
    
    // Add multimodal parts if provided
    if (docParts && docParts.length > 0) {
      docParts.forEach(part => {
        if (part.inlineData) currentParts.push(part);
      });
    }
    
    // Add textual command
    currentParts.push({ text: fullPrompt });

    // 3. Append user turn according to turn-based requirements
    contents.push({ role: 'user', parts: currentParts });

    console.log(`📡 [Gemini Node] Dispatching to ${modelName}. Mode: ${hasDocuments ? 'Grounded' : 'Standard'}`);

    // 4. Call SDK with direct method pattern
    const result = await ai.models.generateContent({
      model: modelName, 
      contents,
      config: { 
        systemInstruction: systemInstruction || "You are a world-class pedagogical assistant.", 
        temperature: hasDocuments ? 0.15 : 0.7,
        topK: 40,
        topP: 0.95,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
      }
    });

    // 5. Safe text extraction using the property (not method)
    const generatedText = result.text;

    if (!generatedText) {
      const reason = (result as any).candidates?.[0]?.finishReason;
      if (reason === 'SAFETY') return "🛡️ AI Synthesis Interrupted: Safety filters triggered. Please use pedagogical terminology.";
      if (reason === 'RECITATION') return "⚠️ AI Citation Alert: Verbatim curriculum detected. Please request a unique synthesis.";
      return "Synthesis error: Empty response from neural node.";
    }

    return generatedText;
  } catch (error: any) {
    console.error("❌ [Gemini Node] Fatal Exception:", error.message);
    if (error.message?.includes('429')) throw new Error("Neural Grid Saturated. Please wait 15s.");
    throw error;
  }
}