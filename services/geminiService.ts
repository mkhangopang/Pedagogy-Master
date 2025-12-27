
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SLO, NeuralBrain, UserProfile } from "../types";
import { adaptiveService } from "./adaptiveService";

export const geminiService = {
  getClient() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API_KEY_MISSING");
    return new GoogleGenAI({ apiKey });
  },

  async generateSLOTagsFromBase64(
    base64Data: string, 
    mimeType: string, 
    brain: NeuralBrain,
    user?: UserProfile
  ): Promise<SLO[]> {
    const ai = this.getClient();
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
          { text: "Analyze this educational document and extract Student Learning Outcomes (SLOs) based on Bloom's levels. Output exactly in JSON format." },
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
      return JSON.parse(response.text || "[]");
    } catch (e) {
      return [];
    }
  },

  async *chatWithDocumentStream(
    message: string, 
    doc: { base64?: string; mimeType?: string }, 
    history: { role: 'user' | 'assistant', content: string }[],
    brain: NeuralBrain,
    user?: UserProfile
  ) {
    const ai = this.getClient();
    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, 'chat') : "";
    
    const systemInstruction = `
      ${brain.masterPrompt}
      ${adaptiveContext}
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
      model: 'gemini-3-flash-preview',
      contents,
      config: {
        systemInstruction,
      },
    });

    for await (const chunk of result) {
      const c = chunk as GenerateContentResponse;
      if (c.text) yield c.text;
    }
  },

  async *generatePedagogicalToolStream(
    toolType: string,
    userInput: string,
    doc: { base64?: string; mimeType?: string },
    brain: NeuralBrain,
    user?: UserProfile
  ) {
    const ai = this.getClient();
    const adaptiveContext = user ? await adaptiveService.buildFullContext(user.id, toolType) : "";
    
    const systemInstruction = `
      ${brain.masterPrompt}
      ${adaptiveContext}
      Bloom's Framework:
      ${brain.bloomRules}
    `;

    const prompt = `
      Tool Type: ${toolType.toUpperCase()}
      User Request: ${userInput}
      Generate high-quality educational content.
    `;

    const parts: any[] = [
      ...(doc.base64 && doc.mimeType ? [{ inlineData: { mimeType: doc.mimeType, data: doc.base64 } }] : []),
      { text: prompt }
    ];

    const result = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: { parts },
      config: {
        systemInstruction,
      },
    });

    for await (const chunk of result) {
      const c = chunk as GenerateContentResponse;
      if (c.text) yield c.text;
    }
  }
};
