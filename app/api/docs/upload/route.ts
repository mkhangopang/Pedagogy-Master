import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { generateCurriculumJson } from '../../../../lib/curriculum/json-generator';
import { synthesize } from '../../../../lib/ai/synthesizer-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * WORLD-CLASS INGESTION PIPELINE (v60.0)
 * Logic: Raw Extraction -> AI Cleaning (Gemini 3 Pro) -> MD Storage (R2) -> Hierarchical JSON (Supabase)
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const body = await req.json();
    const { name, sourceType, extractedText, board, subject, grade, version, previewOnly } = body;

    const supabase = getSupabaseServerClient(token);
    
    // PHASE 1: NEURAL STRUCTURE EXTRACTION (Raw Text -> Structured MD)
    // Using Gemini 3 Pro specifically for structural fidelity
    if (sourceType === 'raw_text' || previewOnly) {
      console.log(`🧠 [Ingestion] Synthesizing refined markdown for: ${name}`);
      
      const conversionPrompt = `You are a high-fidelity curriculum data architect. 
      TASK: Convert this noisy, raw text extracted from a PDF/DOCX into standardized PEDAGOGICAL MARKDOWN.
      
      RULES:
      1. Identify and structure by DOMAIN, STANDARD, BENCHMARK, and SLO.
      2. Use this EXACT SLO format: "- SLO:CODE: Description".
      3. Capture all instructional tables clearly.
      4. Remove all PDF artifacts (page numbers, headers, redundant footers).
      
      RAW CONTENT:
      ${extractedText}`;

      const result = await synthesize(
        conversionPrompt,
        [],
        false,
        [],
        'gemini', // synthesizer-core will route LESSON/COMPLEX tasks to gemini-3-pro
        "System: Convert raw curriculum inputs into high-precision structural markdown."
      );

      return NextResponse.json({ markdown: result.text });
    }

    // PHASE 2: PERMANENT VAULT STORAGE
    if (sourceType !== 'markdown' || !extractedText) {
      return NextResponse.json({ error: "High-fidelity Markdown source is mandatory." }, { status: 400 });
    }

    let filePath = `curricula/${user.id}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
    if (!isR2Configured() || !r2Client) throw new Error("Storage node unreachable.");

    // Store the CLEANED Markdown in R2 as the definitive source blob
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: filePath,
      Body: Buffer.from(extractedText),
      ContentType: 'text/markdown',
    }));

    // PHASE 3: HIERARCHICAL METADATA EXTRACTION
    // Generate the Tree JSON from the high-fidelity AI-cleaned markdown
    const generatedJson = generateCurriculumJson(extractedText);

    // ATOMIC SELECTION CLEANUP
    await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);

    // Commit Metadata & JSON to Supabase
    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      user_id: user.id,
      name,
      source_type: 'markdown',
      status: 'processing',
      is_approved: true,
      extracted_text: extractedText, // This is now the CLEANED Markdown text
      file_path: filePath,
      storage_type: 'r2',
      curriculum_name: name,
      authority: board || generatedJson.metadata?.board || 'General', 
      subject: subject || generatedJson.metadata?.subject || 'General',
      grade_level: grade || generatedJson.metadata?.grade || 'Auto',
      version_year: version || generatedJson.metadata?.version || '2024',
      generated_json: generatedJson,
      is_selected: true,
      rag_indexed: false
    }).select().single();

    if (dbError) throw dbError;

    // PHASE 4: NEURAL VECTOR SYNC
    // Index the CLEANED text for maximum RAG precision
    try {
      await indexDocumentForRAG(docData.id, extractedText, filePath, supabase);
    } catch (indexError: any) {
      console.error(`❌ [Ingestion] Neural Index Fault:`, indexError);
      await supabase.from('documents').update({ status: 'failed' }).eq('id', docData.id);
    }

    return NextResponse.json({ 
      success: true, 
      id: docData.id,
      message: 'Intelligence anchored successfully.' 
    });

  } catch (error: any) {
    console.error("❌ [Upload Route] Ingestion Fatal:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}