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
 * WORLD-CLASS INGESTION GATEWAY (v127.0)
 * Optimized for Massive Curriculum Assets (100+ Pages) & Sindh Progression Grids.
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
    const { name, sourceType, extractedText, previewOnly, metadata, slos, slo_map } = body;
    
    // PHASE 1: Neural Mapping & Extraction (Structured Output)
    if (sourceType === 'raw_text' && previewOnly) {
      console.log(`🧠 [Ingestion] Deep Neural Audit for: ${name} (${extractedText.length} chars)`);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Increased processing window to 500k chars for 185-page documents
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `You are a World-Class Curriculum Engineering Agent. 
        Analyze the provided raw text from the SINDH BIOLOGY CURRICULUM 2024 (Grades IX-XII).
        
        GOALS:
        1. RECONSTRUCT: Convert the raw text into high-fidelity Pedagogical Markdown.
        2. EXHAUSTIVE EXTRACTION: Identify EVERY SINGLE SLO code (e.g., B-09-A-01, S-10-B-05).
        3. GRADE ATTRIBUTION: Use the numeric code (09=Grade 9, 10=Grade 10, 11=Grade 11, 12=Grade 12) to assign the correct grade level to each objective, regardless of column placement.
        4. METADATA: Extract Subject, Authority (Board), and Academic Year.
        
        CRITICAL: The output MUST be a valid JSON object matching the schema.
        
        RAW TEXT: ${extractedText.substring(0, 500000)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              markdown: { type: Type.STRING, description: "Full formatted pedagogical markdown" },
              metadata: {
                type: Type.OBJECT,
                properties: {
                  subject: { type: Type.STRING },
                  grade: { type: Type.STRING, description: "e.g. '9-12' or 'IX-XII'" },
                  board: { type: Type.STRING },
                  difficulty: { type: Type.STRING, enum: ["low", "middle", "high"] }
                }
              },
              slos: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of all unique SLO codes found"
              },
              slo_map: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    code: { type: Type.STRING },
                    text: { type: Type.STRING, description: "Verbatim text of the learning outcome" },
                    grade: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      return NextResponse.json(JSON.parse(response.text || '{}'));
    }

    // PHASE 2: Zero-AI Atomic Ingestion (Permanent Vault Entry)
    if (sourceType === 'markdown' && extractedText) {
      const filePath = `vault/${user.id}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
      if (!isR2Configured() || !r2Client) throw new Error("Cloud Storage Offline.");

      // Archive to R2
      await r2Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: filePath,
        Body: Buffer.from(extractedText),
        ContentType: 'text/markdown',
      }));

      // Commit Metadata to DB
      const { data: docData, error: dbError } = await supabase.from('documents').insert({
        user_id: user.id,
        name: name || "Curriculum Asset",
        source_type: 'markdown',
        status: 'processing',
        extracted_text: extractedText,
        file_path: filePath,
        is_selected: true,
        subject: metadata?.subject || 'Biology',
        grade_level: metadata?.grade || 'IX-XII',
        authority: metadata?.board || 'Sindh Board',
        difficulty_level: metadata?.difficulty || 'high',
        document_summary: `Exhaustive Index: ${slos?.length || 0} SLOs mapped. Primary Grade: ${metadata?.grade}`,
        generated_json: { slos, slo_map } // Persist the structured SLO map
      }).select().single();

      if (dbError) throw dbError;

      // Parallelize Neural Indexing
      indexDocumentForRAG(docData.id, extractedText, filePath, supabase, { ...metadata, slos, slo_map }).catch(e => {
        console.error("Async Indexing Node Exception:", e);
      });

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Invalid Node Pipeline Command." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Ingestion Node Fault]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}