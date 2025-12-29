
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SLO, NeuralBrain, UserProfile, SubscriptionPlan } from "../types";
import { adaptiveService } from "./adaptiveService";

export const geminiService = {
  /**
   * Generates SLO tags. Uses 'gemini-3-flash-preview' for high speed.
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
      Bloom's Taxonomy Levels:
      ${brain.bloomRules}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { text: "Analyze the provided educational document. Extract Student Learning Outcomes (SLOs) mapped to Bloom's taxonomy. Output exactly as a JSON array." },
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

    try {
      const text = response.text || "[]";
      return JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse Gemini SLO response:", e);
      return [];
    }
  },

  /**
   * Chat stream. Uses 'gemini-3-pro-preview' for higher reasoning capability.
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
      The following is a conversation between a teacher and an AI Pedagogical Assistant.
      Source Material is provided in the documents part.
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
  },

  /**
   * Pedagogical Tool stream. Uses 'gemini-3-flash-preview' for speed.
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
      Generate a professional educational ${toolType}.
    `;

    const parts: any[] = [
      ...(doc.base64 && doc.mimeType ? [{ inlineData: { mimeType: doc.mimeType, data: doc.base64 } }] : []),
      { text: `Task: Create ${toolType}. Input details: ${userInput}` }
    ];

    const result = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: { parts },
      config: { systemInstruction },
    });

    for await (const chunk of result) {
      const c = chunk as GenerateContentResponse;
      if (c.text) yield c.text;
    }
  }
};
