
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { processDocument } from '../../../../lib/documents/document-processor';
import { analyzeDocumentWithAI } from '../../../../lib/ai/document-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 120; // Allow sufficient time for deep curriculum audit

/**
 * SECURE INGESTION GATEWAY
 * Persists original assets and extracted text to R2, then triggers deep AI audit.
 */
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

    console.log(`📤 [Ingestion] Processing asset: ${file.name}`);

    const supabase = getSupabaseServerClient(token);
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const r2Key = `${userId}/${timestamp}_${sanitizedName}`;
    const extractedTextR2Key = `${userId}/${timestamp}_${sanitizedName}.txt`;
    
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 1. Storage Selection & Persistence
    if (!isR2Configured() || !r2Client) {
      throw new Error("Cloud infrastructure (R2) not configured for ingestion.");
    }

    // Upload Original Asset to R2
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: file.type
    }));

    // 2. Text Extraction
    const processed = await processDocument(file);
    
    // Upload Extracted Text to R2
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: extractedTextR2Key,
      Body: processed.text,
      ContentType: 'text/plain'
    }));

    // 3. Database Metadata Synchronization
    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      user_id: userId,
      name: processed.filename,
      file_path: r2Key,
      r2_key: r2Key,
      r2_bucket: R2_BUCKET,
      extracted_text_r2_key: extractedTextR2Key,
      mime_type: processed.type,
      word_count: processed.wordCount,
      page_count: processed.pageCount,
      status: 'processing',
      storage_type: 'r2',
      is_selected: true,
      gemini_processed: false
    }).select().single();

    if (dbError) throw new Error(`Database record creation failed: ${dbError.message}`);

    console.log(`✅ [Ingestion] Metadata synchronized. Document ID: ${docData.id}`);

    // 4. Background Pedagogical Audit (Async)
    // We trigger this but don't strictly await it for the response, though we let it run.
    analyzeDocumentWithAI(docData.id, userId, supabase)
      .then(() => console.log(`✅ [AI Audit] Deep processing complete for ${docData.id}`))
      .catch(err => console.error(`❌ [AI Audit] Deep processing failed for ${docData.id}`, err));

    return NextResponse.json({
      success: true,
      id: docData.id,
      name: processed.filename,
      status: 'processing',
      message: '📄 Curriculum asset uploaded. Neural AI is auditing the content...'
    });

  } catch (error: any) {
    console.error('❌ [Ingestion Error]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
