import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from "@google/genai";
import { supabase as anonClient } from '../../../lib/supabase';
import { Buffer } from 'buffer';

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { task, message, doc, history, brain, toolType, userInput, adaptiveContext } = await req.json();
    const apiKey = process.env.API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI key missing' }, { status: 500 });

    const ai = new GoogleGenAI({ apiKey });

    const getDocPart = async () => {
      if (doc?.filePath) {
        const { data, error } = await anonClient.storage
          .from('documents')
          .download(doc.filePath);
        
        if (error || !data) return null;
        
        const arrayBuffer = await data.arrayBuffer();
        const base64 = encodeBase64(new Uint8Array(arrayBuffer));
        return { inlineData: { mimeType: doc.mimeType, data: base64 } };
      }
      return null;
    };

    if (task === 'extract-slos') {
      const docPart = await getDocPart();
      if (!docPart) return NextResponse.json({ error: 'Source node missing' }, { status: 400 });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: [{ text: "Extract SLO tags from the provided curriculum document." }, docPart] },
        config: {
          systemInstruction: `${brain.masterPrompt}\n${adaptiveContext || ''}\n${brain.bloomRules}`,
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
            }
          }
        },
      });
      return NextResponse.json({ text: response.text });
    }

    if (task === 'chat') {
      const docPart = await getDocPart();
      const streamResponse = await ai.models.generateContentStream({
        model: 'gemini-3-pro-preview',
        contents: [
          ...(history || []).map((h: any) => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
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

    return NextResponse.json({ error: 'Unrecognized task' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}