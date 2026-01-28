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
 * HIGH-FIDELITY NEURAL INGESTION GATEWAY (v75.0)
 * Optimized for Sindh 2024 & Complex Educational Grids.
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

    // Handle Metadata vs File Streams
    if (contentType.includes('application/json')) {
      const { name, sourceType, extractedText, board, subject, grade, version } = await req.json();
      
      // Stage 2: Commit final structured MD to vault
      if (sourceType === 'markdown') {
        return await commitToVault(user.id, name, extractedText, { board, subject, grade, version }, supabase);
      }
      return NextResponse.json({ error: "Invalid protocol node." }, { status: 400 });
    }

    // Stage 1: Native Neural Extraction (Raw File -> Structured MD)
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: "No asset stream detected." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Data = buffer.toString('base64');
    
    console.log(`🧠 [Ingestion] Engaging Neural Vision for: ${file.name} (${file.size} bytes)`);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-3-pro-preview'; // Pro for high-stakes curriculum grids

    const response = await ai.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: file.type || 'application/pdf'
            }
          },
          {
            text: `You are a high-fidelity curriculum data architect. 
            TASK: Map this entire document into standardized PEDAGOGICAL MARKDOWN.
            
            STRUCTURE REQUIREMENTS:
            1. Create a '# Curriculum Metadata' section with Board, Subject, Grade, and Version.
            2. Identify every DOMAIN, STANDARD, and BENCHMARK.
            3. Use the EXACT SLO format: "- SLO:CODE: Verbatim Description".
            4. If there are Grids (like page 20-100), convert them into structured sections, NOT just text blocks.
            5. Retain all instructional context. Do not summarize; MAP.
            
            Output ONLY the markdown content.`
          }
        ]
      }],
      config: { 
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    const markdown = response.text;
    if (!markdown) throw new Error("Neural node failed to return extraction mapping.");

    return NextResponse.json({ markdown });

  } catch (error: any) {
    console.error("❌ [Ingestion Fault]:", error);
    return NextResponse.json({ error: error.message || "Synthesis interrupted." }, { status: 500 });
  }
}

async function commitToVault(userId: string, name: string, md: string, metadata: any, supabase: any) {
  const filePath = `curricula/${userId}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
  
  if (!isR2Configured() || !r2Client) throw new Error("Storage node unreachable.");

  // 1. Persistent Storage (R2)
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: filePath,
    Body: Buffer.from(md),
    ContentType: 'text/markdown',
  }));

  // 2. Metadata Extraction
  const generatedJson = generateCurriculumJson(md);

  // 3. Update active status
  await supabase.from('documents').update({ is_selected: false }).eq('user_id', userId);

  // 4. DB Record
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

  // 5. Indexing (Non-blocking retry)
  try {
    await indexDocumentForRAG(docData.id, md, filePath, supabase);
  } catch (e) {
    console.error("Vector sync delayed:", e);
  }

  return NextResponse.json({ success: true, id: docData.id });
}