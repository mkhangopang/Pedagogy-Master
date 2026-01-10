
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { APP_NAME } from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function getDocumentPart(doc: any, supabase: any) {
  if (!doc || (!doc.base64 && !doc.filePath)) return null;
  if (doc.base64) return { inlineData: { mimeType: doc.mimeType, data: doc.base64 } };
  
  if (doc.filePath) {
    try {
      const { data: meta } = await supabase.from('documents').select('storage_type').eq('file_path', doc.filePath).single();
      if (!meta) return null;
      let bytes: Uint8Array;
      if (meta.storage_type === 'r2' && r2Client) {
        const res = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.filePath }));
        bytes = await res.Body?.transformToByteArray() || new Uint8Array();
      } else {
        const { data } = await supabase.storage.from('documents').download(doc.filePath);
        if (!data) return null;
        bytes = new Uint8Array(await data.arrayBuffer());
      }
      return { inlineData: { mimeType: doc.mimeType, data: encodeBase64(bytes) } };
    } catch (e) { return null; }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { task, message, doc, brain, adaptiveContext, history, toolType, userInput } = body;
    
    const supabase = getSupabaseServerClient(token);
    const docPart = await getDocumentPart(doc, supabase);
    
    const systemInstruction = `${adaptiveContext || ''}`;
    const promptText = task === 'chat' ? message : `Generate ${toolType}: ${userInput}`;

    const { text, provider } = await generateAIResponse(
      promptText, 
      history || [], 
      user.id, 
      systemInstruction, 
      docPart,
      toolType
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        // Using APP_NAME instead of individual node provider to maintain branding
        controller.enqueue(encoder.encode(`\n\n---\n*Synthesis by Node: ${APP_NAME}*`));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
