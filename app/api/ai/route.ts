
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';

export const runtime = 'nodejs'; // Use nodejs runtime for better R2/Supabase compatibility

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function getDocumentPart(doc: any, supabase: any) {
  if (!doc) return null;
  if (doc.base64) return { inlineData: { mimeType: doc.mimeType, data: doc.base64 } };
  
  if (doc.filePath) {
    try {
      const { data: meta } = await supabase.from('documents').select('storage_type').eq('file_path', doc.filePath).single();
      let bytes: Uint8Array;
      if (meta?.storage_type === 'r2' && r2Client) {
        const res = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.filePath }));
        bytes = await res.Body?.transformToByteArray() || new Uint8Array();
      } else {
        const { data } = await supabase.storage.from('documents').download(doc.filePath);
        if (!data) return null;
        bytes = new Uint8Array(await data.arrayBuffer());
      }
      return { inlineData: { mimeType: doc.mimeType, data: encodeBase64(bytes) } };
    } catch (e) {
      console.error("Doc part retrieval failed:", e);
      return null;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    // CRITICAL: Read API_KEY directly from server environment to bypass Next.js build-time shadowing
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not configured on the server.");
      return NextResponse.json({ error: 'AI infrastructure not initialized (Key Missing)' }, { status: 500 });
    }

    const { task, message, doc, brain, adaptiveContext, history, toolType, userInput } = await req.json();
    const supabase = getSupabaseServerClient(token);
    const docPart = await getDocumentPart(doc, supabase);
    
    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = `${brain.masterPrompt}\n${adaptiveContext || ''}`;
    const promptText = task === 'chat' ? message : `Generate ${toolType}: ${userInput}`;

    const streamResponse = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: task === 'chat' 
        ? [
            ...(history || []).map((h: any) => ({ 
              role: h.role === 'user' ? 'user' : 'model', 
              parts: [{ text: h.content }] 
            })),
            { role: 'user', parts: [...(docPart ? [docPart] : []), { text: promptText }] }
          ]
        : { parts: [...(docPart ? [docPart] : []), { text: promptText }] },
      config: { 
        systemInstruction,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 0 } 
      },
    });

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamResponse) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
          }
        } catch (e: any) {
          console.error("Streaming error:", e);
          const errorMsg = JSON.stringify(e).includes('429') ? "RATE_LIMIT" : "STREAM_ERR";
          controller.enqueue(encoder.encode(`\n\n[Neural Error: ${errorMsg}]`));
        } finally {
          controller.close();
        }
      }
    }), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });

  } catch (error: any) {
    console.error('AI Route Fatal Error:', error);
    const isRateLimit = JSON.stringify(error).includes('429') || error.status === 429;
    return NextResponse.json(
      { error: isRateLimit ? "Neural engine cooling down. Please wait 10s and retry." : error.message || "Unknown neural error" }, 
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
