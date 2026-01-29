import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { GoogleGenAI, Type } from "@google/genai";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * WORLD-CLASS INGESTION GATEWAY (v126.0)
 * Optimized for Sindh Biology 2024 Progression Grids.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const supabase = getSupabaseServerClient(token);
    const body = await req.json();
    const { name, sourceType, extractedText, previewOnly, metadata, slos } = body;
    
    // PHASE 1: Neural Mapping & Extraction
    if (sourceType === 'raw_text' && previewOnly) {
      console.log(`🧠 [Ingestion] Analyzing Progression Grid: ${name}`);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `You are a curriculum engineering agent. Analyze this raw OCR text from a SINDH CURRICULUM PROGRESSION GRID.
        
        GOALS:
        1. Convert to high-fidelity Pedagogical Markdown.
        2. Extract EXACT metadata: Subject, Board, Difficulty.
        3. Identify ALL SLO codes. 
        
        CRITICAL RULES FOR SINDH GRIDS:
        - The text contains tables where Grade IX, X, XI, and XII are columns.
        - You MUST correctly attribute each objective to its grade using the code:
          * B-09-... or S-09-... -> Grade 9
          * B-10-... or S-10-... -> Grade 10
          * B-11-... or S-11-... -> Grade 11
          * B-12-... or S-12-... -> Grade 12
        - If an objective is in a 'Grade IX' column but the code says 'B-09', it belongs to Grade 9.
        - Return the total range of grades found (e.g., "9-12").
        
        RAW TEXT: ${extractedText.substring(0, 40000)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              markdown: { type: Type.STRING },
              metadata: {
                type: Type.OBJECT,
                properties: {
                  subject: { type: Type.STRING },
                  grade: { type: Type.STRING },
                  board: { type: Type.STRING },
                  difficulty: { type: Type.STRING }
                }
              },
              slos: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            }
          }
        }
      });

      return NextResponse.json(JSON.parse(response.text || '{}'));
    }

    // PHASE 2: Zero-AI Atomic Ingestion
    if (sourceType === 'markdown' && extractedText) {
      const filePath = `vault/${user.id}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
      if (!isR2Configured() || !r2Client) throw new Error("Cloud Storage Offline.");

      await r2Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: filePath,
        Body: Buffer.from(extractedText),
        ContentType: 'text/markdown',
      }));

      const { data: docData, error: dbError } = await supabase.from('documents').insert({
        user_id: user.id,
        name: name || "Curriculum Asset",
        source_type: 'markdown',
        status: 'processing',
        extracted_text: extractedText,
        file_path: filePath,
        is_selected: true,
        subject: metadata?.subject || 'Biology',
        grade_level: metadata?.grade || '9-12',
        authority: metadata?.board || 'Sindh Board',
        difficulty_level: metadata?.difficulty || 'high',
        document_summary: slos?.slice(0, 8).join(', ') || 'Indexed'
      }).select().single();

      if (dbError) throw dbError;

      indexDocumentForRAG(docData.id, extractedText, filePath, supabase, metadata).catch(e => {
        console.error("Async indexing failure:", e);
      });

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Invalid Node Command." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Ingestion Fault]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}