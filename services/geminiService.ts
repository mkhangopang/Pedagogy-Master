
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SLO, NeuralBrain } from "../types";

/**
 * Pedagogy Master Gemini Service
 * Strictly adheres to Google GenAI SDK guidelines.
 */
export const geminiService = {
  async generateSLOTagsFromBase64(
    base64Data: string, 
    mimeType: string, 
    brain: NeuralBrain
  ): Promise<SLO[]> {
    // Initializing exactly as per guidelines
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
      Analyze this educational document and extract Student Learning Outcomes (SLOs).
      
      Pedagogical Framework:
      ${brain.masterPrompt}
      
      Bloom's Rules:
      ${brain.bloomRules}
      
      Output exactly in JSON format as an array of objects.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      config: {
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
      console.error("Failed to parse SLO JSON:", e);
      return [];
    }
  },

  async *chatWithDocumentStream(
    message: string, 
    doc: { base64?: string; mimeType?: string }, 
    history: { role: 'user' | 'assistant', content: string }[],
    brain: NeuralBrain
  ) {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const parts: any[] = [
      { text: `System Instruction: ${brain.masterPrompt}` },
      ...history.map(h => ({ text: `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}` })),
      { text: `Current User Query: ${message}` }
    ];

    if (doc.base64 && doc.mimeType) {
      parts.push({
        inlineData: {
          mimeType: doc.mimeType,
          data: doc.base64
        }
      });
    }

    const result = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [{ parts }],
    });

    for await (const chunk of result) {
      const c = chunk as GenerateContentResponse;
      yield c.text;
    }
  },

  async *generatePedagogicalToolStream(
    toolType: string,
    userInput: string,
    doc: { base64?: string; mimeType?: string },
    brain: NeuralBrain
  ) {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
      Tool Type: ${toolType.toUpperCase()}
      User Request: ${userInput}
      Pedagogical Alignment Required: ${brain.masterPrompt} ${brain.bloomRules}
      Generate high-quality educational content based on the provided parameters.
    `;

    const parts: any[] = [{ text: prompt }];
    
    if (doc.base64 && doc.mimeType) {
      parts.push({
        inlineData: {
          mimeType: doc.mimeType,
          data: doc.base64
        }
      });
    }

    const result = await ai.models.generateContentStream({
      model: "gemini-3-pro-preview",
      contents: [{ parts }],
    });

    for await (const chunk of result) {
      const c = chunk as GenerateContentResponse;
      yield c.text;
    }
  }
};
