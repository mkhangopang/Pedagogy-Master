import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { generateCurriculumJson } from '../../../../lib/curriculum/json-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * NEURAL INGESTION GATEWAY (v16.0)
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

    // 1. STORAGE
    let filePath = `curricula/${user.id}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
    
    if (!isR2Configured() || !r2Client) {
      throw new Error("Cloudflare R2 is not configured. Infrastructure node offline.");
    }

    const uploadParams = {
      Bucket: R2_BUCKET,
      Key: filePath,
      Body: Buffer.from(extractedText),
      ContentType: 'text/markdown',
    };
    await r2Client.send(new PutObjectCommand(uploadParams));

    // 2. JSON
    const generatedJson = generateCurriculumJson(extractedText);

    // 3. METADATA
    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      user_id: user.id,
      name,
      source_type: 'markdown',
      status: 'processing',
      is_approved: true,
      extracted_text: extractedText,
      file_path: filePath,
      storage_type: 'r2',
      curriculum_name: name || `${subject} Grade ${grade}`,
      authority: board || 'Sindh', 
      subject: subject || 'General Science',
      grade_level: grade || '4-8',
      version_year: version || '2023-24',
      generated_json: generatedJson,
      version: 1,
      is_selected: true // Auto-select new ingestions
    }).select().single();

    if (dbError) throw new Error(`Cloud Metadata Sync Failed: ${dbError.message}`);

    // 4. NEURAL INDEXING
    try {
      await indexDocumentForRAG(docData.id, extractedText, filePath, supabase);
      await supabase.from('documents').update({ status: 'ready', rag_indexed: true }).eq('id', docData.id);
    } catch (indexErr: any) {
      console.error('❌ [Neural Indexing Error]:', indexErr);
      await supabase.from('documents').update({ status: 'failed' }).eq('id', docData.id);
    }

    return NextResponse.json({
      success: true,
      id: docData.id,
      message: '🛡️ Institutional Asset Grounded.'
    });

  } catch (error: any) {
    console.error('Ingestion Fatal Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}