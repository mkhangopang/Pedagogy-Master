
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SLO, NeuralBrain } from "../types";

const apiKey = process.env.API_KEY as string;

export const geminiService = {
  /**
   * Uploads a file directly to Gemini's File API using the ai.files namespace.
   * This adheres to the requirement for direct document processing via File API.
   */
  async uploadFile(file: File): Promise<{ uri: string; mimeType: string }> {
    const ai = new GoogleGenAI({ apiKey });
    
    // Direct upload to Gemini File API using the ai.files.upload method
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
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
      Analyze the attached curriculum document and extract Student Learning Outcomes (SLOs).
      For each SLO, determine its Bloom's Taxonomy level, complexity (1-6), relevant keywords, and a suggested assessment.
      
      Rules: ${brain.bloomRules}
      Instruction: ${brain.masterPrompt}
    `;

    // Using ai.models.generateContent as per strict SDK guidelines
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
      console.error("Failed to parse SLO tags", e);
      return [];
    }
  },

  /**
   * Streaming chat session utilizing the stored Gemini File URI.
   */
  async *chatWithDocumentStream(
    message: string, 
    doc: { fileUri?: string; mimeType?: string }, 
    history: { role: 'user' | 'assistant', content: string }[],
    brain: NeuralBrain
  ) {
    const ai = new GoogleGenAI({ apiKey });
    
    // Construct parts: message + file reference if available
    const parts: any[] = [{ text: message }];
    if (doc.fileUri && doc.mimeType) {
      parts.push({ fileData: { fileUri: doc.fileUri, mimeType: doc.mimeType } });
    }

    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: brain.masterPrompt,
      },
    });

    // sendMessageStream requires a message property containing the prompt
    const result = await chat.sendMessageStream({ 
      message: { parts }
    } as any);

    for await (const chunk of result) {
      const c = chunk as GenerateContentResponse;
      yield c.text;
    }
  },

  /**
   * Generates pedagogical tools by referencing the uploaded document URI.
   */
  async *generatePedagogicalToolStream(
    toolType: string,
    userInput: string,
    doc: { fileUri?: string; mimeType?: string },
    brain: NeuralBrain
  ) {
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
      Tool Type: ${toolType}
      User Request: ${userInput}
      Master Instruction: ${brain.masterPrompt}
      Rules: ${brain.bloomRules}
      Please generate a comprehensive ${toolType} based on the request and the provided reference document.
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
