import { NextRequest, NextResponse } from 'next/server';
// Fix: Added missing Buffer import to resolve "Cannot find name 'Buffer'" error
import { Buffer } from 'buffer';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * WORLD-CLASS UPLOAD GATEWAY (v2.0)
 * Logic: Stream to R2 -> Create Metadata Record -> Return Polling ID
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string || file.name;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!isR2Configured() || !r2Client) throw new Error("Cloud Storage Node Offline.");

    const documentId = crypto.randomUUID();
    const timestamp = Date.now();
    const r2Key = `raw/${user.id}/${documentId}/${file.name.replace(/\s+/g, '_')}`;

    // 1. Instant Storage Sync (PDF Archival)
    const buffer = Buffer.from(await file.arrayBuffer());
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: buffer,
      ContentType: file.type,
    }));

    // 2. Database Handshake (Initialization)
    const supabase = getSupabaseServerClient(token);
    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      id: documentId,
      user_id: user.id,
      name: name,
      file_path: r2Key,
      status: 'processing',
      mime_type: file.type,
      subject: 'Identifying...',
      grade_level: 'Mixed',
      is_selected: true,
      document_summary: 'Initializing Neural Ingestion...'
    }).select().single();

    if (dbError) throw new Error(dbError.message);

    return NextResponse.json({ 
      success: true, 
      documentId: docData.id,
      pollUrl: `/api/docs/status/${docData.id}`,
      processUrl: `/api/docs/process/${docData.id}` 
    });

  } catch (error: any) {
    console.error("❌ [Async Upload Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}