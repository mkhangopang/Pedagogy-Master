
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
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

    const { task, message, doc, brain, adaptiveContext, history, toolType, userInput, useSearch } = await req.json();
    
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI key missing' }, { status: 500 });

    const ai = new GoogleGenAI({ apiKey });
    const supabase = getSupabaseServerClient(token);

    /**
     * TTS Task - Multi-speaker support for pedagogical dialogue
     */
    if (task === 'tts') {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Read this educational material clearly and supportively: ${message}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });
      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      return NextResponse.json({ audioData });
    }

    const getDocPart = async () => {
      if (doc?.base64) return { inlineData: { mimeType: doc.mimeType, data: doc.base64 } };
      if (doc?.filePath) {
        try {
          const { data: meta } = await supabase.from('documents').select('storage_type').eq('file_path', doc.filePath).single();
          let bytes: Uint8Array;
          if (meta?.storage_type === 'r2' && r2Client) {
            const res = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.filePath }));
            bytes = await res.Body?.transformToByteArray() || new Uint8Array();
          } else {
            const { data } = await supabase.storage.from('documents').download(doc.filePath);
            bytes = new Uint8Array(await data?.arrayBuffer() || []);
          }
          return { inlineData: { mimeType: doc.mimeType, data: encodeBase64(bytes) } };
        } catch (e) { return null; }
      }
      return null;
    };

    if (task === 'chat') {
      const docPart = await getDocPart();
      const streamResponse = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: [
          ...(history || []).map((h: any) => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
          { role: 'user', parts: [...(docPart ? [docPart] : []), { text: message }] }
        ],
        config: { 
          systemInstruction: `${brain.masterPrompt}\n${adaptiveContext || ''}`,
          tools: useSearch ? [{ googleSearch: {} }] : []
        },
      });

      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of (streamResponse as any)) {
              if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
              // Send source metadata if available
              const sources = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
              if (sources) controller.enqueue(encoder.encode(`\n\nSOURCES_METADATA:${JSON.stringify(sources)}`));
            }
          } finally { controller.close(); }
        }
      }));
    }

    if (task === 'generate-tool') {
      const docPart = await getDocPart();
      const streamResponse = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: { parts: [...(docPart ? [docPart] : []), { text: `Generate ${toolType}: ${userInput}` }] },
        config: { 
          systemInstruction: `${brain.masterPrompt}\n${adaptiveContext || ''}`,
          tools: useSearch ? [{ googleSearch: {} }] : []
        },
      });

      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of (streamResponse as any)) {
              if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
              const sources = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
              if (sources) controller.enqueue(encoder.encode(`\n\nSOURCES_METADATA:${JSON.stringify(sources)}`));
            }
          } finally { controller.close(); }
        }
      }));
    }

    return NextResponse.json({ error: 'Invalid task' }, { status: 400 });
  } catch (error: any) {
    const status = (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) ? 429 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
