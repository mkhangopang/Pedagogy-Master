
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

/**
 * GOOGLE GENERATIVE AI - UNIFIED NEURAL ENGINE
 * Handles pedagogical intelligence tasks with high performance.
 */
export async function POST(req: NextRequest) {
  try {
    const { task, message, doc, history, brain, toolType, userInput, adaptiveContext } = await req.json();
    
    // Initialize Google Generative AI with the server-side API key
    const googleGenerativeAi = new GoogleGenAI({ apiKey: process.env.API_KEY });

    /**
     * TASK: EXTRACT STUDENT LEARNING OUTCOMES (SLOs)
     * optimized for gemini-3-flash-preview for high-speed analysis.
     */
    if (task === 'extract-slos') {
      const systemInstruction = `
        ${brain.masterPrompt}
        ${adaptiveContext || ''}
        OBJECTIVE: Identify all Student Learning Outcomes (SLOs) in the provided document.
        Bloom's Taxonomy Level: ${brain.bloomRules}
        FORMAT: Return ONLY a valid JSON array. Do not include markdown formatting or conversational text.
      `;

      // Use Flash for speed in structural analysis
      const result = await googleGenerativeAi.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: "Extract learning objectives from this file and map them to Bloom's Taxonomy levels." },
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

      return NextResponse.json({ text: result.text });
    }

    /**
     * TASK: PEDAGOGICAL CHAT (STREAMING)
     * Employs Gemini 3 Pro for complex pedagogical reasoning.
     */
    if (task === 'chat') {
      const systemInstruction = `
        ${brain.masterPrompt}
        ${adaptiveContext || ''}
        You are the Pedagogy Master AI. Use the provided document to inform your educational guidance.
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
          } catch (e) {
            console.error("Streaming Error:", e);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream);
    }

    /**
     * TASK: TOOL GENERATION (STREAMING)
     */
    if (task === 'generate-tool') {
      const systemInstruction = `
        ${brain.masterPrompt}
        ${adaptiveContext || ''}
        Synthesize a professional educational ${toolType}.
      `;

      const parts: any[] = [
        ...(doc?.base64 && doc?.mimeType ? [{ inlineData: { mimeType: doc.mimeType, data: doc.base64 } }] : []),
        { text: `Create a comprehensive ${toolType}. User requirements: ${userInput}` }
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

    return NextResponse.json({ error: 'Unsupported pedagogical task' }, { status: 400 });

  } catch (error: any) {
    console.error('Google Generative AI Engine Error:', error);
    return NextResponse.json({ 
      error: error.message || 'The Google Generative AI engine encountered a critical error.' 
    }, { status: 500 });
  }
}
