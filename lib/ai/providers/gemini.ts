import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { resolveApiKey } from "../../env-server";

export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docParts: any[] = []
): Promise<string> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    console.error("❌ [Gemini Node] Missing API Key");
    throw new Error('Neural Node Error: Gemini API key is missing.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    // guidelines specify gemini-3-flash-preview for text tasks
    const modelName = 'gemini-3-flash-preview';

    // 1. Prepare history in strict turn sequence
    const contents: any[] = [];
    const processedHistory = history.slice(-6);
    
    processedHistory.forEach(h => {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      });
    });

    // 2. Prepare the current user turn
    const currentParts: any[] = [];
    
    // Add multimodal parts if provided
    if (docParts && docParts.length > 0) {
      docParts.forEach(part => {
        if (part.inlineData) currentParts.push(part);
      });
    }
    
    // Add the textual command
    currentParts.push({ text: fullPrompt });

    // 3. Append to contents following turn sequence rules
    if (contents.length === 0 || contents[contents.length - 1].role === 'model') {
      contents.push({ role: 'user', parts: currentParts });
    } else {
      contents[contents.length - 1].parts.push(...currentParts);
    }

    console.log(`📡 [Gemini Node] Dispatching to ${modelName}. Mode: ${hasDocuments ? 'Grounded' : 'Standard'}`);

    // 4. Call SDK with explicit safety settings to allow pedagogical scientific content
    const result = await ai.models.generateContent({
      model: modelName, 
      contents,
      config: { 
        systemInstruction: systemInstruction || "You are a world-class pedagogical assistant.", 
        temperature: hasDocuments ? 0.15 : 0.7,
        topK: 40,
        topP: 0.95,
        // CRITICAL FIX: Use Enums to resolve TypeScript "not assignable" error during Vercel build
        safetySettings: [
          { 
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, 
            threshold: HarmBlockThreshold.BLOCK_NONE 
          },
          { 
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, 
            threshold: HarmBlockThreshold.BLOCK_NONE 
          },
          { 
            category: HarmCategory.HARM_CATEGORY_HARASSMENT, 
            threshold: HarmBlockThreshold.BLOCK_NONE 
          },
          { 
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, 
            threshold: HarmBlockThreshold.BLOCK_NONE 
          }
        ]
      }
    });

    // 5. Safe text extraction
    const generatedText = result.text;

    if (!generatedText) {
      const candidate = (result as any).candidates?.[0];
      const reason = candidate?.finishReason;
      
      if (reason === 'SAFETY') {
        return "🛡️ AI Synthesis Interrupted: The pedagogical content triggered an internal safety filter. This is common with sensitive curriculum topics like health or biology. Please rephrase the request.";
      }
      
      if (reason === 'RECITATION') {
        return "⚠️ AI Citation Alert: The synthesis node detected it was reciting curriculum text verbatim. Try asking for an original lesson plan based on the content instead.";
      }

      console.warn(`⚠️ [Gemini Node] Empty response. Finish Reason: ${reason}`);
      return "Synthesis error: The neural node returned an empty response. Check if your curriculum context is too extensive.";
    }

    return generatedText;
  } catch (error: any) {
    console.error("❌ [Gemini Node] Fatal Exception:", error.message);
    if (error.message?.includes('429')) {
      throw new Error("Neural Grid Saturated: API quota exceeded. Please wait a few moments.");
    }
    throw error;
  }
}