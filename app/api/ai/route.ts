
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getDocumentPart(doc: any, supabase: any) {
  if (!doc || (!doc.base64 && !doc.filePath)) return null;
  
  // Quota efficiency: Use provided base64 if available
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
      return { inlineData: { mimeType: doc.mimeType, data: encodeBase64(bytes) } };
    } catch (e) {
      console.error("Neural Doc Retrieval Failure:", e);
      return null;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Session required' }, { status: 401 });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Auth Verification Failed' }, { status: 401 });

    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        error: 'Neural Key Missing: Please verify the API_KEY environment variable.' 
      }, { status: 500 });
    }

    const body = await req.json();
    const { task, message, doc, brain, adaptiveContext, history, toolType, userInput } = body;
    
    const supabase = getSupabaseServerClient(token);
    const docPart = await getDocumentPart(doc, supabase);
    
    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = `${brain?.masterPrompt || ''}\n${adaptiveContext || ''}`;
    const promptText = task === 'chat' ? message : `Generate ${toolType}: ${userInput}`;

    /**
     * QUOTA EFFICIENCY: Context Construction
     * We only attach the document part ONCE in the conversation history to save tokens.
     * If history exists, we attach it to the first message.
     */
    let contents: any[];
    if (task === 'chat') {
      const mappedHistory = (history || []).map((h: any, idx: number) => {
        const parts: any[] = [{ text: h.content }];
        // Only attach doc to the very first message of the conversation to avoid token multiplication
        if (idx === 0 && docPart) parts.unshift(docPart);
        return { role: h.role === 'user' ? 'user' : 'model', parts };
      });

      const currentParts: any[] = [{ text: promptText }];
      // If there was no history, the current message is the first one
      if (mappedHistory.length === 0 && docPart) {
        currentParts.unshift(docPart);
      }

      contents = [...mappedHistory, { role: 'user', parts: currentParts }];
    } else {
      contents = [{ role: 'user', parts: [...(docPart ? [docPart] : []), { text: promptText }] }];
    }

    // ROBUST RETRY LOOP with Exponential Backoff + Jitter
    let streamResponse;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        streamResponse = await ai.models.generateContentStream({
          model: 'gemini-3-flash-preview', 
          contents,
          config: { 
            systemInstruction,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 0 } 
          },
        });
        break; 
      } catch (e: any) {
        attempts++;
        const errStr = JSON.stringify(e).toLowerCase();
        const isRateLimited = errStr.includes('429') || errStr.includes('resource_exhausted') || errStr.includes('503');
        
        if (isRateLimited && attempts < maxAttempts) {
          // Exponential Backoff with Jitter: (2^attempts * 1000) + random
          const backoff = (Math.pow(2, attempts) * 1000) + (Math.random() * 1000);
          console.warn(`[AI Engine] Node Saturated. Backing off ${Math.round(backoff)}ms... (${attempts}/${maxAttempts})`);
          await sleep(backoff);
          continue;
        }
        throw e;
      }
    }

    if (!streamResponse) throw new Error("Synthesis Initialization Failed.");

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
      { error: isRateLimit ? "The neural engine is currently saturated due to Free Tier limits. Please wait 15 seconds." : (error.message || "Neural gateway timeout.") }, 
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
