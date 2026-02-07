
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const runtime = 'nodejs'; 
export const dynamic = 'force-dynamic';

/**
 * WORLD-CLASS UPLOAD HANDSHAKE (v4.2)
 * PROTOCOL: NODEJS RUNTIME
 * FEATURE: Pre-extracted text support for timeout mitigation.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Identity' }, { status: 401 });

    const body = await req.json();
    const { name, contentType, extractedText } = body;

    if (!name || !contentType) {
      return NextResponse.json({ error: 'Metadata missing (name, contentType)' }, { status: 400 });
    }

    if (!isR2Configured() || !r2Client) throw new Error("Cloud Storage Node Offline.");

    const documentId = crypto.randomUUID();
    const r2Key = `raw/${user.id}/${documentId}/${name.replace(/\s+/g, '_')}`;

    // 1. Generate Pre-signed URL for direct R2 upload
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      ContentType: contentType,
      Metadata: {
        documentId: documentId,
        userId: user.id
      }
    });

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 900 });

    // 2. Initialize Record in Supabase
    const supabase = getSupabaseServerClient(token);
    
    // Clear previous selection
    await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);

    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      id: documentId,
      user_id: user.id,
      name: name,
      file_path: r2Key,
      status: 'processing',
      mime_type: contentType,
      subject: 'Identifying...',
      grade_level: 'Auto',
      is_selected: true,
      document_summary: 'Waiting for binary handshake...',
      rag_indexed: false,
      extracted_text: extractedText || "",
      is_approved: false,
      version: 1
    }).select().single();

    if (dbError) throw new Error(dbError.message);

    return NextResponse.json({ 
      success: true, 
      documentId: docData.id,
      uploadUrl: uploadUrl,
      r2Key: r2Key,
      contentType: contentType
    });

  } catch (error: any) {
    console.error("❌ [Upload Handshake Error]:", error);
    return NextResponse.json({ 
      error: error.message || 'Synthesis grid exception.' 
    }, { status: 500 });
  }
}
