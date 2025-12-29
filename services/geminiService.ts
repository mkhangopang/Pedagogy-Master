
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SLO, NeuralBrain, UserProfile, SubscriptionPlan } from "../types";
import { adaptiveService } from "./adaptiveService";

export const geminiService = {
  /**
   * Generates SLO tags. Uses 'gemini-3-flash-preview' for maximum speed.
   */
  async generateSLOTagsFromBase64(
    base64Data: string, 
    mimeType: string, 
    brain: NeuralBrain,
    user?: UserProfile
  ): Promise<SLO[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, 'slo-tagger') : "";
    
    const systemInstruction = `
      ${brain.masterPrompt}
      ${adaptiveContext}
      Task: Analyze the educational document and extract high-precision SLOs.
      Bloom's Taxonomy Levels: ${brain.bloomRules}
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: "Extract Student Learning Outcomes (SLOs) mapped to Bloom's taxonomy. Return ONLY a valid JSON array." },
            { inlineData: { mimeType, data: base64Data } }
          ]
        },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                content: { type: Type.STRING },
                bloomLevel: { type: Type.STRING },
                cognitiveComplexity: { type: Type.NUMBER },
                keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                suggestedAssessment: { type: Type.STRING },
              },
              required: ["id", "content", "bloomLevel", "cognitiveComplexity", "keywords", "suggestedAssessment"],
            },
          },
        },
      });

      const text = response.text;
      return text ? JSON.parse(text) : [];
    } catch (e) {
      console.error("Gemini SLO Extraction Error:", e);
      throw new Error("Gemini was unable to parse this document structure.");
    }
  },

  /**
   * Chat stream. Uses 'gemini-3-pro-preview' for complex pedagogical reasoning.
   */
  async *chatWithDocumentStream(
    message: string, 
    doc: { base64?: string; mimeType?: string }, 
    history: { role: 'user' | 'assistant', content: string }[],
    brain: NeuralBrain,
    user?: UserProfile
  ) {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, 'chat') : "";
    
    const tools: any[] = [];
    if (user?.plan !== SubscriptionPlan.FREE) {
      tools.push({ googleSearch: {} });
    }

    const systemInstruction = `
      ${brain.masterPrompt}
      ${adaptiveContext}
      You are the Pedagogy Master AI. Use the provided document as context for your educational recommendations.
    `;

    const contents: any[] = [
      ...history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      })),
      {
        role: 'user',
        parts: [
          ...(doc.base64 && doc.mimeType ? [{ inlineData: { mimeType: doc.mimeType, data: doc.base64 } }] : []),
          { text: message }
        ]
      }
    ];

    try {
      const result = await ai.models.generateContentStream({
        model: 'gemini-3-pro-preview',
        contents,
        config: {
          systemInstruction,
          tools: tools.length > 0 ? tools : undefined
        },
      });

      for await (const chunk of result) {
        const c = chunk as GenerateContentResponse;
        if (c.text) yield c.text;
      }
    } catch (e) {
      console.error("Gemini Chat Stream Error:", e);
      yield "Engine Error: Unable to fetch pedagogical response.";
    }
  },

  /**
   * Pedagogical Tool stream. Uses 'gemini-3-flash-preview' for fast asset generation.
   */
  async *generatePedagogicalToolStream(
    toolType: string,
    userInput: string,
    doc: { base64?: string; mimeType?: string },
    brain: NeuralBrain,
    user?: UserProfile
  ) {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, toolType) : "";
    
    const systemInstruction = `
      ${brain.masterPrompt}
      ${adaptiveContext}
      Bloom's Framework: ${brain.bloomRules}
      Task: Generate a high-quality educational ${toolType}.
    `;

    const parts: any[] = [
      ...(doc.base64 && doc.mimeType ? [{ inlineData: { mimeType: doc.mimeType, data: doc.base64 } }] : []),
      { text: `Drafting: ${toolType}. Specific Details: ${userInput}` }
    ];

    try {
      const result = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: { systemInstruction },
      });

      for await (const chunk of result) {
        const c = chunk as GenerateContentResponse;
        if (c.text) yield c.text;
      }
    } catch (e) {
      console.error("Gemini Tool Generation Error:", e);
      yield "Error generating pedagogical artifact.";
    }
  }
};
