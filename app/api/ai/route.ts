
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Max allowed on Vercel Pro; Hobby is 10s

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getDocumentPart(doc: any, supabase: any) {
  if (!doc) return null;
  // If we already have the base64, use it directly (Direct Processing)
  if (doc.base64) return { inlineData: { mimeType: doc.mimeType, data: doc.base64 } };
  
  if (doc.filePath) {
    try {
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
      // Pass the raw data directly to Gemini for efficient multimodal analysis
      return { inlineData: { mimeType: doc.mimeType, data: encodeBase64(bytes) } };
    } catch (e) {
      console.error("Direct Processing Error: File retrieval failed:", e);
      return null;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Neural context lost: Session required' }, { status: 401 });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Auth Verification Failed' }, { status: 401 });

    // Multi-key detection for Vercel/Studio environments
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        error: 'System Alert: Neural API Key missing. Please set API_KEY or GEMINI_API_KEY in Vercel settings.' 
      }, { status: 500 });
    }

    const body = await req.json();
    const { task, message, doc, brain, adaptiveContext, history, toolType, userInput } = body;
    
    const supabase = getSupabaseServerClient(token);
    const docPart = await getDocumentPart(doc, supabase);
    
    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = `${brain?.masterPrompt || ''}\n${adaptiveContext || ''}`;
    const promptText = task === 'chat' ? message : `Generate ${toolType}: ${userInput}`;

    const contents = task === 'chat' 
      ? [
          ...(history || []).map((h: any) => ({ 
            role: h.role === 'user' ? 'user' : 'model', 
            parts: [{ text: h.content }] 
          })),
          { role: 'user', parts: [...(docPart ? [docPart] : []), { text: promptText }] }
        ]
      : { parts: [...(docPart ? [docPart] : []), { text: promptText }] };

    // SERVER-SIDE RESILIENCE: Retry 429/503 internally before failing
    let streamResponse;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        streamResponse = await ai.models.generateContentStream({
          model: 'gemini-3-flash-preview', // Quota efficient model for EdTech
          contents,
          config: { 
            systemInstruction,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 0 } 
          },
        });
        break; // Success
      } catch (e: any) {
        attempts++;
        const errStr = JSON.stringify(e).toLowerCase();
        const isRetryable = errStr.includes('429') || errStr.includes('503') || errStr.includes('resource_exhausted');
        
        if (isRetryable && attempts < maxAttempts) {
          console.warn(`Neural Node Saturated. Retrying attempt ${attempts}/${maxAttempts}...`);
          await sleep(1500 * attempts); // Gradual backoff
          continue;
        }
        throw e; // Non-retryable
      }
    }

    if (!streamResponse) throw new Error("Could not initialize Neural Stream.");

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
          console.error("Neural Stream Interrupted:", e);
          const errStr = JSON.stringify(e).toLowerCase();
          let signal = 'STREAM_ERR';
          if (errStr.includes('429')) signal = 'RATE_LIMIT';
          if (errStr.includes('403')) signal = 'AUTH_FAIL';
          controller.enqueue(encoder.encode(`\n\nERROR_SIGNAL:${signal}`));
        } finally {
          controller.close();
        }
      }
    }), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });

  } catch (error: any) {
    console.error('AI Route Fatal:', error);
    const errStr = JSON.stringify(error).toLowerCase();
    const isRateLimit = errStr.includes('429') || errStr.includes('resource_exhausted');
    
    return NextResponse.json(
      { error: isRateLimit ? "Neural cooling in progress. Please pause for 10s." : (error.message || "Neural gateway timeout.") }, 
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
