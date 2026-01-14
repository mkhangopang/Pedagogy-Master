
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

/**
 * NEURAL INGESTION GATEWAY
 * Logic: Save Markdown to Cloudflare R2 -> Store Metadata in Supabase -> Trigger Vector Embedding
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const body = await req.json();
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
    
    if (sourceType !== 'markdown' || !extractedText) {
      return NextResponse.json({ error: "Institutional Policy: Only Markdown curricula can be indexable." }, { status: 400 });
    }

    // 1. PHYSICAL STORAGE IN CLOUDFLARE R2 (Target bucket: 'documents')
    let filePath = `curricula/${user.id}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
    
    if (!isR2Configured() || !r2Client) {
      throw new Error("Cloudflare R2 is not configured. Infrastructure node offline.");
    }

    try {
      const uploadParams = {
        Bucket: R2_BUCKET, // This is 'documents' based on your lib/r2.ts
        Key: filePath,
        Body: Buffer.from(extractedText),
        ContentType: 'text/markdown',
      };
      await r2Client.send(new PutObjectCommand(uploadParams));
      console.log(`✅ [R2 Storage] Asset persisted to ${R2_BUCKET}/${filePath}`);
    } catch (r2Err: any) {
      console.error('R2 Primary Storage Failed:', r2Err);
      throw new Error(`Cloudflare Storage Error: ${r2Err.message}`);
    }

    // 2. NAVIGABLE JSON GENERATION (For UI Context)
    const generatedJson = generateCurriculumJson(extractedText);

    // 3. DATABASE RECORD (Metadata & R2 Pointer)
    // We map 'board' to 'authority' to satisfy the Sindh Curriculum requirements
    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      user_id: user.id,
      name,
      source_type: 'markdown',
      status: 'processing',
      is_approved: true,
      extracted_text: extractedText, // Redundant fallback for quick RAG access
      file_path: filePath,
      storage_type: 'r2',
      curriculum_name: name || `${subject} Grade ${grade}`,
      authority: board || 'Sindh', 
      subject: subject || 'General Science',
      grade_level: grade || '4-8',
      version_year: version || '2023-24',
      generated_json: generatedJson,
      version: 1
    }).select().single();

    if (dbError) {
      // If the error contains 'authority', it confirms the schema drift
      if (dbError.message.includes('authority')) {
        console.error('CRITICAL: Database schema mismatch. "authority" column missing.');
      }
      throw new Error(`Cloud Metadata Sync Failed: ${dbError.message}`);
    }

    // 4. NEURAL VECTOR INDEXING (Asynchronous process)
    try {
      await indexCurriculumMarkdown(docData.id, extractedText, supabase, {
        board, subject, grade, version
      });
      
      // Update status to ready once vector grid is updated
      await supabase.from('documents').update({ status: 'ready' }).eq('id', docData.id);
    } catch (indexErr: any) {
      console.error('❌ [Neural Indexing Error]:', indexErr);
      await supabase.from('documents').update({ status: 'failed' }).eq('id', docData.id);
      return NextResponse.json({ error: `Sync Warning: Document saved to R2 but neural indexing failed: ${indexErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      id: docData.id,
      message: '🛡️ Institutional Asset Grounded & Saved to Cloudflare R2.'
    });

  } catch (error: any) {
    console.error('Ingestion Fatal Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
