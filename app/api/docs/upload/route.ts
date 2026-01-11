import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { processDocument } from '../../../../lib/documents/document-processor';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;

    if (userId !== user.id) return NextResponse.json({ error: 'Identity mismatch' }, { status: 403 });
    if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 });

    const supabase = getSupabaseServerClient(token);
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const r2Key = `${userId}/${timestamp}_${sanitizedName}`;
    
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    if (!isR2Configured() || !r2Client) {
      throw new Error("Cloud infrastructure (R2) not configured.");
    }

    // 1. Raw Storage
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: file.type
    }));

    // 2. Local Extraction
    const processed = await processDocument(file);

    // 3. Database Sync
    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      user_id: userId,
      name: processed.filename,
      file_path: r2Key,
      mime_type: processed.type,
      status: 'processing',
      storage_type: 'r2',
      is_selected: true,
      gemini_processed: false
    }).select().single();

    if (dbError) throw dbError;

    // 4. Background Neural Indexing (RAG)
    // Trigger and let run in background
    indexDocumentForRAG(docData.id, processed.text, supabase)
      .catch(e => console.error(`RAG Indexing Error for ${docData.id}:`, e));

    return NextResponse.json({
      success: true,
      id: docData.id,
      name: processed.filename,
      status: 'processing',
      message: '📄 Curriculum asset uploaded. Neural indexing in progress...'
    });

  } catch (error: any) {
    console.error('Ingestion Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
