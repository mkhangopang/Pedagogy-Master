import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { createPrivilegedClient, supabase as anonClient } from '../../../lib/supabase';

// Helper to encode ArrayBuffer to base64 without relying on Node.js Buffer global
function encodeBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * GOOGLE GENERATIVE AI - UNIFIED NEURAL ENGINE (v38.2)
 * High-performance server-based AI bridge.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Verify identity with the standard client
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    const { task, message, doc, history, brain, toolType, userInput, adaptiveContext } = await req.json();
    
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Server environment is missing AI credentials.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // HELPER: Resolve document content using a privileged client for reliability
    const getDocPart = async () => {
      if (doc?.filePath) {
        // USE PRIVILEGED CLIENT: This bypasses RLS on the server for speed and reliability,
        // since we've already verified the 'user' identity above.
        const adminClient = createPrivilegedClient();
        const { data, error } = await adminClient.storage.from('documents').download(doc.filePath);
        
        if (error || !data) {
          console.error("Privileged Storage Fetch Error:", error);
          return null;
        }
        
        const buffer = await data.arrayBuffer();
        const base64 = encodeBase64(buffer);
        return { inlineData: { mimeType: doc.mimeType, data: base64 } };
      }
      if (doc?.base64) {
        return { inlineData: { mimeType: doc.mimeType, data: doc.base64 } };
      }
      return null;
    };

    /**
     * TASK: STUDENT LEARNING OUTCOME (SLO) EXTRACTION
     */
    if (task === 'extract-slos') {
      const docPart = await getDocPart();
      if (!docPart) return NextResponse.json({ error: 'Curriculum source inaccessible for analysis.' }, { status: 400 });

      const systemInstruction = `
        ${brain.masterPrompt}
        ${adaptiveContext || ''}
        CORE TASK: Extract Student Learning Outcomes (SLOs) from the curriculum material.
        TAXONOMY RULES: ${brain.bloomRules}
        OUTPUT: JSON array of SLO objects.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: "Extract curriculum alignment nodes from this file." },
            docPart
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
     */
    if (task === 'chat') {
      const docPart = await getDocPart();
      const systemInstruction = `
        ${brain.masterPrompt}
        ${adaptiveContext || ''}
        You are the Pedagogy Master AI. Provide expert pedagogical advice based on the provided material.
      `;

      const contents = [
        ...history.map((h: any) => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }]
        })),
        {
          role: 'user',
          parts: [
            ...(docPart ? [docPart] : []),
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
          try {
            for await (const chunk of streamResponse) {
              const c = chunk as GenerateContentResponse;
              if (c.text) controller.enqueue(encoder.encode(c.text));
            }
          } catch (e) {
            console.error("Stream disrupted:", e);
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
      const docPart = await getDocPart();
      const systemInstruction = `
        ${brain.masterPrompt}
        ${adaptiveContext || ''}
        TASK: Professional ${toolType} Generation.
        REFERENCE: Align strictly with the curriculum source material provided.
      `;

      const parts: any[] = [
        ...(docPart ? [docPart] : []),
        { text: `Synthesize a ${toolType}. Alignment Requirements: ${userInput}` }
      ];

      const streamResponse = await ai.models.generateContentStream({
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
              if (c.text) controller.enqueue(encoder.encode(c.text));
            }
          } catch (e) {
             console.error("Tool stream break:", e);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream);
    }

    return NextResponse.json({ error: 'Unrecognized pedagogical task' }, { status: 400 });

  } catch (error: any) {
    console.error('AI Route Critical Error:', error);
    return NextResponse.json({ 
      error: error.message || 'The AI engine encountered a critical error.' 
    }, { status: 500 });
  }
}