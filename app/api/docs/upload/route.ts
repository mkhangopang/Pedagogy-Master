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
    
    // CASE: RAW TEXT CONVERSION (Failover Resilience Active)
    if (sourceType === 'raw_text' || previewOnly) {
      // We pass the full text; synthesize() now handles provider-specific truncation
      const conversionPrompt = `Convert this raw curriculum text into high-fidelity markdown with sections for Metadata, Units, and SLOs. 
      Use EXACT names if found. Ensure SLOs follow the format: "- SLO: CODE: Description".
      
      FILE: ${name}
      RAW CONTENT TO STRUCTURE:
      ${extractedText}`;

      const result = await synthesize(
        conversionPrompt,
        [],
        false,
        [],
        'gemini', 
        "You are a curriculum data engineer. Structure the input into clean markdown."
      );

      return NextResponse.json({ markdown: result.text });
    }

    if (sourceType !== 'markdown' || !extractedText) {
      return NextResponse.json({ error: "High-fidelity Markdown source is mandatory." }, { status: 400 });
    }

    // 1. Cloud Storage Persistence
    let filePath = `curricula/${user.id}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
    if (!isR2Configured() || !r2Client) throw new Error("Storage node unreachable.");

    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: filePath,
      Body: Buffer.from(extractedText),
      ContentType: 'text/markdown',
    }));

    // 2. ATOMIC EXCLUSIVE SELECTION
    await supabase
      .from('documents')
      .update({ is_selected: false })
      .eq('user_id', user.id);
    
    const generatedJson = generateCurriculumJson(extractedText);

    // 3. Database Metadata Commitment
    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      user_id: user.id,
      name,
      source_type: 'markdown',
      status: 'processing',
      is_approved: true,
      extracted_text: extractedText,
      file_path: filePath,
      storage_type: 'r2',
      curriculum_name: name,
      authority: board || 'General', 
      subject: subject || 'General',
      grade_level: grade || 'Auto',
      version_year: version || '2024',
      generated_json: generatedJson,
      is_selected: true,
      rag_indexed: false
    }).select().single();

    if (dbError) throw dbError;

    // 4. Critical Neural Synchronization
    try {
      await indexDocumentForRAG(docData.id, extractedText, filePath, supabase);
    } catch (indexError: any) {
      console.error(`❌ [Ingestion] Deep Audit Failed:`, indexError);
      await supabase.from('documents').update({ status: 'failed' }).eq('id', docData.id);
    }

    return NextResponse.json({ 
      success: true, 
      id: docData.id,
      message: 'Document uploaded and neural audit complete.' 
    });

  } catch (error: any) {
    console.error("❌ [Upload Route] Ingestion Fatal:", error);
    // Return a cleaner error message instead of raw JSON
    const cleanMessage = error.message?.includes('429') ? 'AI Quota Saturated. Fallback node pending.' : error.message;
    return NextResponse.json({ error: cleanMessage }, { status: 500 });
  }
}