
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SLO, NeuralBrain } from "../types";

/**
 * Pedagogy Master Gemini Service
 * Adheres to strict @google/genai SDK guidelines.
 */
export const geminiService = {
  /**
   * Helper to get a fresh AI instance
   */
  getAI() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API_KEY is not defined in the environment.");
    }
    return new GoogleGenAI({ apiKey });
  },

  async uploadFile(file: File): Promise<{ uri: string; mimeType: string }> {
    const ai = this.getAI();
    const uploadResult = await ai.files.upload(file, {
      mimeType: file.type,
      displayName: file.name,
    });
    return {
      uri: uploadResult.file.uri,
      mimeType: uploadResult.file.mimeType,
    };
  },

  async generateSLOTagsFromFile(fileUri: string, mimeType: string, brain: NeuralBrain): Promise<SLO[]> {
    const ai = this.getAI();
    const prompt = `
      Analyze the curriculum document provided via File API and extract Student Learning Outcomes (SLOs).
      Follow these rules: ${brain.bloomRules}
      Instruction: ${brain.masterPrompt}
      
      Output exactly in JSON format as an array of objects.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          { text: prompt },
          { fileData: { fileUri, mimeType } }
        ]
      },
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
      return JSON.parse(response.text || "[]");
    } catch (e) {
      console.error("JSON parse failed for SLO extraction", e);
      return [];
    }
  },

  async *chatWithDocumentStream(
    message: string, 
    doc: { fileUri?: string; mimeType?: string }, 
    history: { role: 'user' | 'assistant', content: string }[],
    brain: NeuralBrain
  ) {
    const ai = this.getAI();
    const formattedHistory = history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }]
    }));

    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      history: formattedHistory,
      config: {
        systemInstruction: brain.masterPrompt,
      },
    });

    const currentParts: any[] = [{ text: message }];
    if (doc.fileUri && doc.mimeType) {
      currentParts.push({ fileData: { fileUri: doc.fileUri, mimeType: doc.mimeType } });
    }

    const result = await chat.sendMessageStream({ message: currentParts });

    for await (const chunk of result) {
      const c = chunk as GenerateContentResponse;
      yield c.text;
    }
  },

  async *generatePedagogicalToolStream(
    toolType: string,
    userInput: string,
    doc: { fileUri?: string; mimeType?: string },
    brain: NeuralBrain
  ) {
    const ai = this.getAI();
    const prompt = `
      Tool Type: ${toolType}
      User Request: ${userInput}
      Master Instruction: ${brain.masterPrompt}
      Rules: ${brain.bloomRules}
      Use the provided document context to generate a high-quality ${toolType}.
    `;

    const parts: any[] = [{ text: prompt }];
    if (doc.fileUri && doc.mimeType) {
      parts.push({ fileData: { fileUri: doc.fileUri, mimeType: doc.mimeType } });
    }

    const result = await ai.models.generateContentStream({
      model: "gemini-3-pro-preview",
      contents: { parts },
    });

    for await (const chunk of result) {
      const c = chunk as GenerateContentResponse;
      yield c.text;
    }
  }
};
