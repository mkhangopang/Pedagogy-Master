
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { supabase as anonClient } from '../../../lib/supabase';
import { r2Client, BUCKET_NAME } from '../../../lib/r2';
import { GetObjectCommand } from "@aws-sdk/client-s3";

/**
 * Robust Base64 Encoder
 * Handles both ArrayBuffer and SharedArrayBuffer to resolve TS error:
 * "Argument of type 'ArrayBufferLike' is not assignable to parameter of type 'ArrayBuffer'"
 */
function encodeBase64(buffer: ArrayBuffer | ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { task, message, doc, history, brain, toolType, userInput, adaptiveContext } = await req.json();
    const apiKey = process.env.API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI Credentials missing' }, { status: 500 });

    const ai = new GoogleGenAI({ apiKey });

    const getDocPart = async () => {
      // SECURE RETRIEVAL FROM CLOUDFLARE R2
      if (doc?.filePath) {
        try {
          const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: doc.filePath,
          });
          const response = await r2Client.send(command);
          const bytes = await response.Body?.transformToByteArray();
          
          if (!bytes) return null;
          
          // Fix: Ensure we pass the underlying buffer to the encoder
          const base64 = encodeBase64(bytes.buffer);
          return { inlineData: { mimeType: doc.mimeType, data: base64 } };
        } catch (r2Err: any) {
          console.error("R2 AI Retrieval Error:", r2Err);
          return null;
        }
      }
      if (doc?.base64) return { inlineData: { mimeType: doc.mimeType, data: doc.base64 } };
      return null;
    };

    if (task === 'extract-slos') {
      const docPart = await getDocPart();
      if (!docPart) return NextResponse.json({ error: 'Source curriculum inaccessible in R2.' }, { status: 400 });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: [{ text: "Extract curriculum alignment nodes." }, docPart] },
        config: {
          systemInstruction: `${brain.masterPrompt}\n${adaptiveContext || ''}\nTAXONOMY: ${brain.bloomRules}`,
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

    if (task === 'chat') {
      const docPart = await getDocPart();
      const streamResponse = await ai.models.generateContentStream({
        model: 'gemini-3-pro-preview',
        contents: [
          ...history.map((h: any) => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
          { role: 'user', parts: [...(docPart ? [docPart] : []), { text: message }] }
        ],
        config: { systemInstruction: `${brain.masterPrompt}\n${adaptiveContext || ''}` },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for await (const chunk of streamResponse) {
            if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
          }
          controller.close();
        },
      });
      return new Response(stream);
    }

    if (task === 'generate-tool') {
      const docPart = await getDocPart();
      const streamResponse = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: { parts: [...(docPart ? [docPart] : []), { text: `Synthesize a ${toolType}: ${userInput}` }] },
        config: { systemInstruction: `${brain.masterPrompt}\n${adaptiveContext || ''}` },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for await (const chunk of streamResponse) {
            if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
          }
          controller.close();
        },
      });
      return new Response(stream);
    }

    return NextResponse.json({ error: 'Unrecognized task' }, { status: 400 });
  } catch (error: any) {
    console.error("AI Route Exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
