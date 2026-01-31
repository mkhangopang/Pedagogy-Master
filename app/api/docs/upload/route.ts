import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * WORLD-CLASS UPLOAD HANDSHAKE (v3.2)
 * Logic: Generate Signed URL -> Direct Browser-to-R2 Upload (Bypasses 4.5MB Limit)
 * Error Handling: Explicit guidance for missing schema columns.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

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

    // 2. Initialize Database Record
    const supabase = getSupabaseServerClient(token);
    
    // Auto-deselect others
    await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);

    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      id: documentId,
      user_id: user.id,
      name: name,
      file_path: r2Key,
      status: 'processing',
      mime_type: contentType,
      subject: 'Identifying...',
      grade_level: 'Mixed',
      is_selected: true,
      document_summary: 'Waiting for binary handshake...' 
    }).select().single();

    if (dbError) {
      // Check for common schema errors
      const isMissingCol = dbError.message.includes('column') || dbError.code === '42703';
      if (isMissingCol) {
        throw new Error(`SCHEMA_MISMATCH: Missing curriculum intelligence columns (document_summary, rag_indexed, etc). Run the Repair SQL script in Sidebar > Master Recipe.`);
      }
      throw new Error(dbError.message);
    }

    return NextResponse.json({ 
      success: true, 
      documentId: docData.id,
      uploadUrl: uploadUrl,
      r2Key: r2Key
    });

  } catch (error: any) {
    console.error("❌ [Upload Handshake Error]:", error);
    return NextResponse.json({ 
      error: error.message || 'Synthesis grid exception.' 
    }, { status: error.message?.includes('SCHEMA_MISMATCH') ? 409 : 500 });
  }
}