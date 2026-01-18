
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

/**
 * HIGH-FIDELITY GEMINI ADAPTER (v30.0)
 * Optimized for Gemini 3 with Thinking Config and Google Search Grounding.
 */
export async function callGemini(
  fullPrompt: string, 
  history: any[], 
  systemInstruction: string, 
  hasDocuments: boolean = false,
  docParts: any[] = []
): Promise<{ text: string; groundingMetadata?: any }> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // TASK-BASED MODEL SCALING
    // Use Gemini 3 Pro for complex design tasks; Flash for quick lookups.
    const isComplexTask = fullPrompt.includes('LESSON PLAN') || 
                         fullPrompt.includes('ASSESSMENT') || 
                         fullPrompt.includes('RUBRIC') ||
                         fullPrompt.length > 8000;
    
    const modelName = isComplexTask ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

    // Prepare Turn-based contents
    const contents: any[] = [];
    
    // Add history
    history.slice(-6).forEach(h => {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      });
    });

    // Current turn parts
    const currentParts: any[] = [];
    if (docParts && docParts.length > 0) {
      docParts.forEach(part => {
        if (part.inlineData) currentParts.push(part);
      });
    }
    currentParts.push({ text: fullPrompt });
    contents.push({ role: 'user', parts: currentParts });

    const config: any = {
      systemInstruction: systemInstruction || "You are a world-class pedagogical assistant.",
      temperature: hasDocuments ? 0.1 : 0.7,
      topK: 40,
      topP: 0.95,
      // Enable Thinking for complex reasoning
      thinkingConfig: isComplexTask ? { thinkingBudget: 16000 } : { thinkingBudget: 0 }
    };

    // Add Google Search grounding for research-heavy queries if using Pro model
    if (modelName === 'gemini-3-pro-preview' && (fullPrompt.includes('research') || fullPrompt.includes('latest'))) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config
    });

    const generatedText = response.text;

    if (!generatedText) {
      return { text: "Synthesis interrupted. Please refine your pedagogical parameters." };
    }

    return { 
      text: generatedText,
      groundingMetadata: response.candidates?.[0]?.groundingMetadata 
    };
  } catch (error: any) {
    console.error("❌ [Gemini 3 Node] Error:", error.message);
    throw error;
  }
}
