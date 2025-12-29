import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

/**
 * GOOGLE GENERATIVE AI - UNIFIED NEURAL ENGINE
 * This server-side route handles all pedagogical intelligence tasks using
 * the latest Google GenAI SDK and Gemini 3 models.
 */
export async function POST(req: NextRequest) {
  try {
    const { task, message, doc, history, brain, toolType, userInput, adaptiveContext } = await req.json();
    
    // Initialize the official Google GenAI instance
    // Note: process.env.API_KEY must be configured in your environment variables
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    /**
     * TASK: EXTRACT STUDENT LEARNING OUTCOMES (SLOs)
     * Direct multimodal analysis of document structure using Gemini 3 Flash.
     */
    if (task === 'extract-slos') {
      const systemInstruction = `
        ${brain.masterPrompt}
        ${adaptiveContext || ''}
        OBJECTIVE: Analyze the educational document and extract high-precision SLOs.
        TAXONOMY: ${brain.bloomRules}
        FORMAT: Return a JSON array of objects.
      `;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: "Read the attached document and identify all learning outcomes. Map them to Bloom's taxonomy." },
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

      // Extract generated JSON string from the .text property
      return NextResponse.json({ text: result.text });
    }

    /**
     * TASK: PEDAGOGICAL CHAT (STREAMING)
     * Deep reasoning and adaptive conversation using Gemini 3 Pro.
     */
    if (task === 'chat') {
      const systemInstruction = `
        ${brain.masterPrompt}
        ${adaptiveContext || ''}
        You are the Pedagogy Master AI. The user has provided a document for contextual reference. 
        Refer to it natively to provide high-level educational strategy and support.
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

      const streamResponse = await ai.models.generateContentStream({
        model: 'gemini-3-pro-preview',
        contents,
        config: { systemInstruction },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for await (const chunk of streamResponse) {
            const c = chunk as GenerateContentResponse;
            if (c.text) {
              controller.enqueue(encoder.encode(c.text));
            }
          }
          controller.close();
        },
      });

      return new Response(stream);
    }

    /**
     * TASK: TOOL GENERATION (STREAMING)
     * Synthesizing teaching materials based on document context.
     */
    if (task === 'generate-tool') {
      const systemInstruction = `
        ${brain.masterPrompt}
        ${adaptiveContext || ''}
        OBJECTIVE: Synthesize a professional educational ${toolType}.
        CONTEXT: Use the provided document as the primary source of truth.
      `;

      const parts: any[] = [
        ...(doc?.base64 && doc?.mimeType ? [{ inlineData: { mimeType: doc.mimeType, data: doc.base64 } }] : []),
        { text: `Draft a comprehensive ${toolType} for classroom use. Requirements: ${userInput}` }
      ];

      const streamResponse = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: { systemInstruction },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for await (const chunk of streamResponse) {
            const c = chunk as GenerateContentResponse;
            if (c.text) {
              controller.enqueue(encoder.encode(c.text));
            }
          }
          controller.close();
        },
      });

      return new Response(stream);
    }

    return NextResponse.json({ error: 'Unrecognized pedagogical task' }, { status: 400 });

  } catch (error: any) {
    console.error('Google Generative AI Engine Error:', error);
    return NextResponse.json({ 
      error: error.message || 'The AI engine encountered an unexpected error.' 
    }, { status: 500 });
  }
}