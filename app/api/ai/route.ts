
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';

export const runtime = 'nodejs';
export const maxDuration = 60; // Increase timeout for document-heavy processing

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function getDocumentPart(doc: any, supabase: any) {
  if (!doc) return null;
  if (doc.base64) return { inlineData: { mimeType: doc.mimeType, data: doc.base64 } };
  
  if (doc.filePath) {
    try {
      // Direct metadata check
      const { data: meta, error: metaErr } = await supabase
        .from('documents')
        .select('storage_type')
        .eq('file_path', doc.filePath)
        .single();
        
      if (metaErr || !meta) return null;

      let bytes: Uint8Array;
      if (meta.storage_type === 'r2' && r2Client) {
        const res = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.filePath }));
        bytes = await res.Body?.transformToByteArray() || new Uint8Array();
      } else {
        const { data, error: storageErr } = await supabase.storage.from('documents').download(doc.filePath);
        if (storageErr || !data) return null;
        bytes = new Uint8Array(await data.arrayBuffer());
      }
      
      if (bytes.length === 0) return null;
      return { inlineData: { mimeType: doc.mimeType, data: encodeBase64(bytes) } };
    } catch (e) {
      console.error("Critical: Document part extraction failed:", e);
      return null;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth session expired' }, { status: 401 });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'User context lost' }, { status: 401 });

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'System: Neural API Key missing in server environment.' }, { status: 500 });
    }

    const body = await req.json();
    const { task, message, doc, brain, adaptiveContext, history, toolType, userInput } = body;
    
    const supabase = getSupabaseServerClient(token);
    const docPart = await getDocumentPart(doc, supabase);
    
    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = `${brain?.masterPrompt || ''}\n${adaptiveContext || ''}`;
    const promptText = task === 'chat' ? message : `Generate ${toolType}: ${userInput}`;

    // Use gemini-3-flash-preview for speed and efficiency in EdTech tasks
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
          console.error("Stream Runtime Error:", e);
          const is429 = JSON.stringify(e).includes('429');
          controller.enqueue(encoder.encode(`\n\nERROR_SIGNAL:${is429 ? 'RATE_LIMIT' : 'INTERRUPTED'}`));
        } finally {
          controller.close();
        }
      }
    }), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });

  } catch (error: any) {
    console.error('Fatal AI Route Exception:', error);
    const errString = JSON.stringify(error).toLowerCase();
    const isRateLimit = errString.includes('429') || errString.includes('resource_exhausted');
    
    return NextResponse.json(
      { error: isRateLimit ? "Neural cooling in progress (Rate Limit). Please wait 10s." : (error.message || "The neural gateway encountered an unexpected error.") }, 
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
