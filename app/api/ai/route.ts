
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
        error: 'Neural Key Missing' 
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
     * QUOTA OPTIMIZATION:
     * 1. Limit history to the last 6 messages to keep token count low.
     * 2. Only send document part in the most recent user turn if history is long.
     */
    let contents: any[];
    if (task === 'chat') {
      const MAX_HISTORY = 6;
      const recentHistory = (history || []).slice(-MAX_HISTORY);
      
      contents = recentHistory.map((h: any, idx: number) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      }));

      // Attach doc to the current prompt only to ensure it's "fresh" for the model turn
      // while keeping historical turns lean.
      const currentParts: any[] = [{ text: promptText }];
      if (docPart) currentParts.unshift(docPart);

      contents.push({ role: 'user', parts: currentParts });
    } else {
      contents = [{ role: 'user', parts: [...(docPart ? [docPart] : []), { text: promptText }] }];
    }

    // ROBUST RETRY: Exponential backoff + Jitter to survive 15 RPM limits
    let streamResponse;
    let attempts = 0;
    const maxAttempts = 6;

    while (attempts < maxAttempts) {
      try {
        streamResponse = await ai.models.generateContentStream({
          model: 'gemini-3-flash-preview', 
          contents,
          config: { 
            systemInstruction,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 0 } // Disabling thinking to save on complexity/rate-limits
          },
        });
        break; 
      } catch (e: any) {
        attempts++;
        const errStr = JSON.stringify(e).toLowerCase();
        const isRateLimited = errStr.includes('429') || errStr.includes('resource_exhausted') || errStr.includes('503');
        
        if (isRateLimited && attempts < maxAttempts) {
          // Increase wait: 2s, 4s, 8s, 16s...
          const backoff = (Math.pow(2, attempts) * 1000) + (Math.random() * 500);
          console.warn(`[AI Engine] Rate Limit. Backoff ${Math.round(backoff)}ms. Attempt ${attempts}/${maxAttempts}`);
          await sleep(backoff);
          continue;
        }
        throw e;
      }
    }

    if (!streamResponse) throw new Error("Synthesis node unavailable.");

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
          console.error("Stream Error:", e);
          controller.enqueue(encoder.encode(`\n\nERROR_SIGNAL:RATE_LIMIT`));
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
      { error: isRateLimit ? "Neural cooling in progress. The Gemini free tier is under high load. Please wait 20s and try again." : (error.message || "Synthesis interrupted.") }, 
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
