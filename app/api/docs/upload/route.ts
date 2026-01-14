
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { indexCurriculumMarkdown } from '../../../../lib/rag/document-indexer';
import { generateCurriculumJson } from '../../../../lib/curriculum/json-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const body = await req.json(); // Handling JSON upload for MD text + Metadata
    const { 
      name, 
      sourceType, 
      extractedText, 
      board, 
      subject, 
      grade, 
      version 
    } = body;

    const supabase = getSupabaseServerClient(token);
    
    // FEATURE 2 & 3: Mandatory Validation already happened in UI, but we re-check here
    if (sourceType !== 'markdown' || !extractedText) {
      return NextResponse.json({ error: "Institutional Policy: Only Markdown curricula can be indexable." }, { status: 400 });
    }

    // FEATURE 4: Auto-Generate JSON
    const generatedJson = generateCurriculumJson(extractedText);

    // 1. Database Entry (Strict Metadata)
    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      user_id: user.id,
      name,
      sourceType: 'markdown',
      status: 'ready',
      isApproved: true,
      extracted_text: extractedText,
      curriculumName: `${subject} Grade ${grade}`,
      authority: board,
      subject,
      gradeLevel: grade,
      versionYear: version,
      generatedJson,
      version: 1
    }).select().single();

    if (dbError) throw dbError;

    // 2. Neural Indexing (Markdown-Only)
    // FEATURE 5: Chunking by Standard
    try {
      await indexCurriculumMarkdown(docData.id, extractedText, supabase, {
        board, subject, grade, version
      });
    } catch (indexErr: any) {
      console.error('❌ [Indexing Error]:', indexErr);
      // We don't fail the whole upload, but mark as failed status
      await supabase.from('documents').update({ status: 'failed' }).eq('id', docData.id);
      return NextResponse.json({ error: indexErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      id: docData.id,
      message: '🛡️ Curriculum Asset Grounded Successfully.'
    });

  } catch (error: any) {
    console.error('Ingestion Fatal Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
