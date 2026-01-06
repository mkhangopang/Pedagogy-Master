
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { r2Client, R2_BUCKET } from '../../../lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Enhanced Backoff Utility
 * Implements exponential backoff with jitter to avoid retry storms.
 */
async function backoff(attempt: number) {
  const baseDelay = 3000; // Start at 3s
  const maxDelay = 15000; // Cap at 15s
  const exponential = Math.pow(2, attempt) * baseDelay;
  const jitter = Math.random() * 1000;
  const delay = Math.min(maxDelay, exponential + jitter);
  return new Promise(resolve => setTimeout(resolve, delay));
}

async function withRetry(fn: () => Promise<any>, retries = 4) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorStr = JSON.stringify(error).toLowerCase();
      const isRateLimit = 
        error.status === 429 || 
        error.message?.includes('429') || 
        errorStr.includes('429') ||
        errorStr.includes('resource_exhausted') ||
        errorStr.includes('too many requests');
      
      if (isRateLimit && i < retries) {
        await backoff(i);
        continue;
      }
      throw error;
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { task, message, doc, brain, adaptiveContext, history, toolType, userInput } = await req.json();
    
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI key missing' }, { status: 500 });

    const ai = new GoogleGenAI({ apiKey });
    const supabase = getSupabaseServerClient(token);

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

    const docPart = await getDocPart();
    const systemInstruction = `${brain.masterPrompt}\n${adaptiveContext || ''}`;

    if (task === 'chat' || task === 'generate-tool') {
      const promptText = task === 'chat' ? message : `Generate ${toolType}: ${userInput}`;
      
      const streamResponse = await withRetry(() => ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: task === 'chat' 
          ? [
              ...(history || []).map((h: any) => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
              { role: 'user', parts: [...(docPart ? [docPart] : []), { text: promptText }] }
            ]
          : { parts: [...(docPart ? [docPart] : []), { text: promptText }] },
        config: { 
          systemInstruction,
          temperature: 0.7,
          thinkingConfig: { thinkingBudget: 0 } 
        },
      }));

      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of (streamResponse as any)) {
              if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
            }
          } catch (e: any) {
            const is429 = JSON.stringify(e).includes('429');
            controller.enqueue(encoder.encode(`\n\nERROR:${is429 ? 'RATE_LIMIT_HIT' : 'STREAM_INTERRUPTED'}`));
          } finally { controller.close(); }
        }
      }));
    }

    return NextResponse.json({ error: 'Invalid task' }, { status: 400 });
  } catch (error: any) {
    const errorStr = JSON.stringify(error).toLowerCase();
    const isRateLimit = error.status === 429 || errorStr.includes('429') || errorStr.includes('resource_exhausted');
    
    return NextResponse.json(
      { error: isRateLimit ? "The neural engine is currently cooling down due to high global demand. We are retrying your request. If this persists, please wait 10 seconds." : error.message }, 
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
