
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SLO, NeuralBrain } from "../types";

/**
 * Pedagogy Master Gemini Service
 * Adheres strictly to Google GenAI SDK standards.
 */
export const geminiService = {
  /**
   * Internal helper to initialize the AI client.
   * Prioritizes process.env.API_KEY (mapped in next.config.js), 
   * but supports AI Studio key selection fallback.
   */
  async getClient() {
    let apiKey = process.env.API_KEY;

    // Fallback for AI Studio preview environment if environment variable is missing
    if (!apiKey && typeof window !== 'undefined' && (window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await (window as any).aistudio.openSelectKey();
        apiKey = process.env.API_KEY;
      }
    }

    if (!apiKey) {
      throw new Error("API_KEY_MISSING");
    }

    return new GoogleGenAI({ apiKey });
  },

  async generateSLOTagsFromBase64(
    base64Data: string, 
    mimeType: string, 
    brain: NeuralBrain
  ): Promise<SLO[]> {
    const ai = await this.getClient();
    
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
    const ai = await this.getClient();
    
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
      if (c.text) yield c.text;
    }
  },

  async *generatePedagogicalToolStream(
    toolType: string,
    userInput: string,
    doc: { base64?: string; mimeType?: string },
    brain: NeuralBrain
  ) {
    const ai = await this.getClient();
    
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
      if (c.text) yield c.text;
    }
  }
};
