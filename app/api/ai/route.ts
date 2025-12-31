
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

/**
 * GOOGLE GENERATIVE AI - UNIFIED NEURAL ENGINE
 * This route serves as the central intelligence hub for Pedagogy Master,
 * utilizing the latest Gemini 3 models for native multimodal document reasoning.
 */
export async function POST(req: NextRequest) {
  try {
    const { task, message, doc, history, brain, toolType, userInput, adaptiveContext } = await req.json();
    
    // Strictly use API_KEY from environment
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API Key is not configured in the server environment.' }, { status: 500 });
    }

    const googleGenerativeAi = new GoogleGenAI({ apiKey });

    /**
     * TASK: STUDENT LEARNING OUTCOME (SLO) EXTRACTION
     * Uses Gemini 3 Flash for high-speed structural analysis of documents.
     */
    if (task === 'extract-slos') {
      const systemInstruction = `
        ${brain.masterPrompt}
        ${adaptiveContext || ''}
        CORE TASK: Analyze the provided curriculum document and extract precise Student Learning Outcomes (SLOs).
        TAXONOMY RULES: ${brain.bloomRules}
        OUTPUT REQUIREMENT: Return a valid JSON array of SLO objects only.
      `;

      const response = await googleGenerativeAi.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: "Read this document carefully and map out all learning objectives according to Bloom's taxonomy." },
            { inlineData: { mimeType: doc.mimeType, data: doc.base64 } }
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

      return NextResponse.json({ text: response.text });
    }

    /**
     * TASK: PEDAGOGICAL ADAPTIVE CHAT (STREAMING)
     * Uses Gemini 3 Pro for deep reasoning and educational strategy.
     */
    if (task === 'chat') {
      const systemInstruction = `
        ${brain.masterPrompt}
        ${adaptiveContext || ''}
        You are the Pedagogy Master AI. The user has provided a document for context. 
        Refer to its content natively to provide expert pedagogical advice.
      `;

      const contents = [
        ...history.map((h: any) => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }]
        })),
        {
          role: 'user',
          parts: [
            ...(doc?.base64 && doc?.mimeType ? [{ inlineData: { mimeType: doc.mimeType, data: doc.base64 } }] : []),
            { text: message }
          ]
        }
      ];

      const streamResponse = await googleGenerativeAi.models.generateContentStream({
        model: 'gemini-3-pro-preview',
        contents,
        config: { systemInstruction },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamResponse) {
              const c = chunk as GenerateContentResponse;
              if (c.text) {
                controller.enqueue(encoder.encode(c.text));
              }
            }
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream);
    }

    /**
     * TASK: EDUCATIONAL TOOL SYNTHESIS (STREAMING)
     */
    if (task === 'generate-tool') {
      const systemInstruction = `
        ${brain.masterPrompt}
        ${adaptiveContext || ''}
        TASK: Synthesize a professional ${toolType}.
        SOURCE MATERIAL: Use the provided document as the primary pedagogical source.
      `;

      const parts: any[] = [
        ...(doc?.base64 && doc?.mimeType ? [{ inlineData: { mimeType: doc.mimeType, data: doc.base64 } }] : []),
        { text: `Draft a high-quality ${toolType}. Specific requirements: ${userInput}` }
      ];

      const streamResponse = await googleGenerativeAi.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: { systemInstruction },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamResponse) {
              const c = chunk as GenerateContentResponse;
              if (c.text) {
                controller.enqueue(encoder.encode(c.text));
              }
            }
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream);
    }

    return NextResponse.json({ error: 'Unrecognized pedagogical task' }, { status: 400 });

  } catch (error: any) {
    console.error('Google Generative AI Critical Error:', error);
    return NextResponse.json({ 
      error: error.message || 'The Google Generative AI engine encountered a critical error.' 
    }, { status: 500 });
  }
}
