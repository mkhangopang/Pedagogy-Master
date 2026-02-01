import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const runtime = 'edge'; // Optimization: Use edge for high-speed handshake
export const dynamic = 'force-dynamic';

/**
 * WORLD-CLASS UPLOAD HANDSHAKE (v3.6)
 * Optimized with Edge Runtime for minimal latency.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    // Use a lightweight check or the provided token for Supabase
    // On Edge, we need to ensure our supabase client handles the environment
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Identity' }, { status: 401 });

    const body = await req.json();
    const { name, contentType } = body;

    if (!name || !contentType) {
      return NextResponse.json({ error: 'Metadata missing (name, contentType)' }, { status: 400 });
    }

    if (!isR2Configured() || !r2Client) throw new Error("Cloud Storage Node Offline.");

    const documentId = crypto.randomUUID();
    const r2Key = `raw/${user.id}/${documentId}/${name.replace(/\s+/g, '_')}`;

    // 1. Generate Pre-signed URL
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 900 });

    // 2. Initialize Record
    const supabase = getSupabaseServerClient(token);
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
      document_summary: 'Waiting for binary handshake...' 
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