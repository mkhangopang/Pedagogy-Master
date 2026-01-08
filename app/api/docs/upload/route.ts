
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured, R2_PUBLIC_BASE_URL } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';

/**
 * SECURE STORAGE GATEWAY
 * Orchestrates document persistence between Cloudflare R2 and Supabase Storage.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Request
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;

    if (userId !== user.id) {
       return NextResponse.json({ error: 'Identity mismatch' }, { status: 403 });
    }

    if (!file || !userId) {
      return NextResponse.json({ error: 'Missing file or identity' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient(token);
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${userId}/${timestamp}_${sanitizedName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // --- STRATEGY: CLOUDFLARE R2 (Primary Storage) ---
    if (isR2Configured() && r2Client) {
      try {
        await r2Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: filePath,
            Body: buffer,
            ContentType: file.type,
            Metadata: {
              'original-name': file.name,
              'user-id': userId
            }
          })
        );

        // For simple text-based files, we also store the text content in R2 for easy AI fetching
        let extractedTextR2Key = null;
        if (file.type === 'text/plain' || file.type === 'text/csv' || file.type === 'application/json') {
          extractedTextR2Key = `${filePath}.txt`;
          await r2Client.send(
            new PutObjectCommand({
              Bucket: R2_BUCKET,
              Key: extractedTextR2Key,
              Body: buffer.toString('utf-8'),
              ContentType: 'text/plain',
            })
          );
        }

        // Register metadata in Supabase DB
        const { data, error } = await supabase.from('documents').insert({
          user_id: userId,
          name: file.name,
          file_path: filePath,
          r2_key: filePath,
          r2_bucket: R2_BUCKET,
          extracted_text_r2_key: extractedTextR2Key,
          mime_type: file.type,
          status: 'ready',
          storage_type: 'r2',
          is_public: !!R2_PUBLIC_BASE_URL,
          is_selected: true,
          content_cached: false
        }).select().single();

        if (error) throw error;

        return NextResponse.json({
          id: data.id,
          name: data.name,
          filePath: data.file_path,
          mimeType: data.mime_type,
          storage: 'r2'
        });
      } catch (err: any) {
        console.error("R2 Upload Error:", err);
        return NextResponse.json({ error: `R2 Node Error: ${err.message}` }, { status: 502 });
      }
    }

    // --- FALLBACK: SUPABASE STORAGE ---
    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(filePath, buffer, { contentType: file.type, upsert: true });

    if (storageError) throw storageError;

    const { data, error } = await supabase.from('documents').insert({
      user_id: userId,
      name: file.name,
      file_path: filePath,
      mime_type: file.type,
      status: 'ready',
      storage_type: 'supabase',
      is_selected: true
    }).select().single();

    if (error) throw error;

    return NextResponse.json({
      id: data.id,
      name: data.name,
      filePath: data.file_path,
      mimeType: data.mime_type,
      storage: 'supabase'
    });

  } catch (error: any) {
    console.error('❌ Upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
