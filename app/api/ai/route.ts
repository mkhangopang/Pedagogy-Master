
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from "@google/genai";
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

    const { task, message, doc, brain, adaptiveContext, history, toolType, userInput } = await req.json();
    
    // Support both naming conventions for the API Key
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ 
        error: 'AI key missing. Please ensure GEMINI_API_KEY is set in your environment variables.' 
      }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const supabase = getSupabaseServerClient(token);

    /**
     * Unified Document Retrieval
     */
    const getDocPart = async () => {
      if (doc?.base64) {
        return { inlineData: { mimeType: doc.mimeType, data: doc.base64 } };
      }

      if (doc?.filePath) {
        try {
          const { data: meta } = await supabase.from('documents').select('storage_type').eq('file_path', doc.filePath).single();
          let bytes: Uint8Array;
          
          if (meta?.storage_type === 'r2' && r2Client) {
            const response = await r2Client.send(new GetObjectCommand({
              Bucket: R2_BUCKET,
              Key: doc.filePath
            }));
            const arrayBuffer = await response.Body?.transformToByteArray();
            if (!arrayBuffer) return null;
            bytes = arrayBuffer;
          } else {
            const { data, error } = await supabase.storage.from('documents').download(doc.filePath);
            if (error || !data) return null;
            bytes = new Uint8Array(await data.arrayBuffer());
          }

          return { inlineData: { mimeType: doc.mimeType, data: encodeBase64(bytes) } };
        } catch (e) {
          console.error("Doc retrieval error:", e);
          return null;
        }
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
          try {
            for await (const chunk of (streamResponse as any)) {
              if (chunk.text) {
                controller.enqueue(encoder.encode(chunk.text));
              }
            }
          } catch (e) {
            console.error("Chat Stream Error:", e);
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream);
    }

    if (task === 'generate-tool') {
      const docPart = await getDocPart();
      const prompt = `Task: Generate a ${toolType}.\nUser Requirements: ${userInput}\nReference Document: ${docPart ? 'Provided' : 'Not Provided'}`;
      
      const streamResponse = await ai.models.generateContentStream({
        model: 'gemini-3-pro-preview',
        contents: { 
          parts: [...(docPart ? [docPart] : []), { text: prompt }] 
        },
        config: { 
          systemInstruction: `${brain.masterPrompt}\n${adaptiveContext || ''}\nFocus specifically on generating a high-quality ${toolType} structure.` 
        },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of (streamResponse as any)) {
              if (chunk.text) {
                controller.enqueue(encoder.encode(chunk.text));
              }
            }
          } catch (e) {
            console.error("Tool Gen Stream Error:", e);
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream);
    }

    return NextResponse.json({ error: 'Unrecognized task' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
