
import { GoogleGenAI, Type } from "@google/genai";

export type QueryIntent = 'lookup' | 'creation' | 'analysis' | 'comparison' | 'general';

export interface IntentResult {
  intent: QueryIntent;
  complexity: 1 | 2 | 3;
  suggestedProvider: string;
  isSTEM: boolean;
  requiresGrounding: boolean;
}

/**
 * NEURAL INTENT CLASSIFIER (v1.0)
 * Uses Gemini 3 Flash for zero-cost, high-speed routing logic.
 */
export async function classifyIntent(query: string): Promise<IntentResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Classify the pedagogical intent of this user query: "${query}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: { type: Type.STRING, enum: ['lookup', 'creation', 'analysis', 'comparison', 'general'] },
            complexity: { type: Type.INTEGER, description: "1: Simple recall, 2: Application, 3: Complex synthesis" },
            suggestedProvider: { type: Type.STRING, description: "gemini-pro, groq, deepseek, or gemini-flash" },
            isSTEM: { type: Type.BOOLEAN },
            requiresGrounding: { type: Type.BOOLEAN }
          },
          required: ["intent", "complexity", "suggestedProvider", "isSTEM", "requiresGrounding"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (e) {
    // Default fallback
    return {
      intent: 'general',
      complexity: 2,
      suggestedProvider: 'gemini-flash',
      isSTEM: false,
      requiresGrounding: true
    };
  }
}
