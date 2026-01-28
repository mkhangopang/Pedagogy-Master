import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { generateCurriculumJson } from '../../../../lib/curriculum/json-generator';
import { GoogleGenAI } from "@google/genai";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * HIGH-CAPACITY NEURAL INGESTION GATEWAY (v80.0)
 * Optimized for Raw Text Ingestion -> AI Structuring -> R2 Vaulting.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const supabase = getSupabaseServerClient(token);
    const contentType = req.headers.get('content-type') || '';

    // Handle Metadata/Text Ingestion
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const { name, sourceType, extractedText, board, subject, grade, version, previewOnly } = body;
      
      // PHASE 1: Neural Synthesis (Raw Text -> Structured MD)
      if (sourceType === 'raw_text' && previewOnly) {
        console.log(`🧠 [Ingestion] Synthesizing high-fidelity mapping for: ${name}`);
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const model = 'gemini-3-pro-preview';

        const prompt = `You are a world-class curriculum data architect. 
        TASK: Convert this raw, extracted text into standardised PEDAGOGICAL MARKDOWN.
        
        STRUCTURE RULES:
        1. Start with '# Curriculum Metadata' listing Board, Subject, Grade, and Version.
        2. Organise by 'DOMAIN', 'STANDARD', 'BENCHMARK'.
        3. Use EXACT SLO format: "- SLO:CODE: Verbatim Description".
        4. Preserve all instructional tables and grids as markdown tables.
        5. Output ONLY the resulting markdown.
        
        RAW INPUT:
        ${extractedText.substring(0, 150000)}`;

        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { 
            temperature: 0.1,
            thinkingConfig: { thinkingBudget: 4000 }
          }
        });

        const markdown = response.text;
        if (!markdown) throw new Error("Neural synthesis returned empty buffer.");

        return NextResponse.json({ markdown });
      }

      // PHASE 2: Permanent Commit (MD -> R2 -> Supabase)
      if (sourceType === 'markdown' && extractedText) {
        return await commitToVault(user.id, name, extractedText, { board, subject, grade, version }, supabase);
      }

      return NextResponse.json({ error: "Invalid ingestion protocol." }, { status: 400 });
    }

    return NextResponse.json({ error: "Unsupported payload format." }, { status: 400 });

  } catch (error: any) {
    console.error("❌ [Ingestion Fatal]:", error);
    return NextResponse.json({ error: error.message || "Synthesis grid interrupted." }, { status: 500 });
  }
}

async function commitToVault(userId: string, name: string, md: string, metadata: any, supabase: any) {
  const filePath = `curricula/${userId}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
  
  if (!isR2Configured() || !r2Client) throw new Error("Storage node unreachable.");

  // 1. Persistent Blob Storage (R2)
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: filePath,
    Body: Buffer.from(md),
    ContentType: 'text/markdown',
  }));

  // 2. Metadata Extraction from Cleaned MD
  const generatedJson = generateCurriculumJson(md);

  // 3. Selection Reset
  await supabase.from('documents').update({ is_selected: false }).eq('user_id', userId);

  // 4. DB Record Ingestion
  const { data: docData, error: dbError } = await supabase.from('documents').insert({
    user_id: userId,
    name,
    source_type: 'markdown',
    status: 'processing',
    extracted_text: md,
    file_path: filePath,
    storage_type: 'r2',
    authority: metadata.board || generatedJson.metadata?.board || 'General',
    subject: metadata.subject || generatedJson.metadata?.subject || 'General',
    grade_level: metadata.grade || generatedJson.metadata?.grade || 'Auto',
    version_year: metadata.version || generatedJson.metadata?.version || '2024',
    generated_json: generatedJson,
    is_selected: true,
    rag_indexed: false
  }).select().single();

  if (dbError) throw dbError;

  // 5. Neural Indexing (Sync)
  try {
    await indexDocumentForRAG(docData.id, md, filePath, supabase);
  } catch (e) {
    console.error("Vector sync fault:", e);
  }

  return NextResponse.json({ success: true, id: docData.id });
}