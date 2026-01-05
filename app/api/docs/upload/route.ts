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
      return NextResponse.json({ error: 'Authentication required for ingestion' }, { status: 401 });
    }

    // Verify user identity via Supabase
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session context' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;

    // Security check: Ensure the userId matches the authenticated user
    if (userId !== user.id) {
       return NextResponse.json({ error: 'Identity mismatch detected during ingestion' }, { status: 403 });
    }

    if (!file || !userId) {
      return NextResponse.json({ error: 'Missing file or user identity' }, { status: 400 });
    }

    // Initialize authenticated server client for DB sync
    const supabase = getSupabaseServerClient(token);

    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${userId}/${timestamp}_${sanitizedName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // --- STRATEGY A: CLOUDFLARE R2 (Primary Institutional Storage) ---
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

        // Register metadata in Supabase DB for indexing using authenticated client
        const { data, error } = await supabase.from('documents').insert({
          user_id: userId,
          name: file.name,
          file_path: filePath,
          mime_type: file.type,
          status: 'ready',
          storage_type: 'r2',
          is_public: !!R2_PUBLIC_BASE_URL
        }).select().single();

        if (error) {
          console.error("Supabase Metadata Sync Error:", error);
          throw new Error(`R2 Success but Database Sync Failed: ${error.message}`);
        }

        return NextResponse.json({
          id: data.id,
          name: data.name,
          filePath: data.file_path,
          mimeType: data.mime_type,
          storage: 'r2',
          isPublic: !!R2_PUBLIC_BASE_URL
        });
      } catch (r2Error: any) {
        console.error("Critical R2 Infrastructure Failure:", r2Error);
        // If R2 metadata registration fails specifically, we shouldn't attempt fallback
        if (r2Error.message.includes('Sync Failed')) {
           return NextResponse.json({ error: r2Error.message }, { status: 500 });
        }
        console.warn("R2 Node Failed. Attempting Supabase Fallback...");
      }
    }

    // --- STRATEGY B: SUPABASE STORAGE (Native Fallback) ---
    try {
      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(filePath, buffer, { 
          contentType: file.type,
          upsert: true
        });

      if (storageError) {
        console.error("Supabase Storage Fallback Failure:", storageError);
        throw new Error(`Supabase Storage Rejected Payload: ${storageError.message}`);
      }

      const { data: dbData, error: dbError } = await supabase.from('documents').insert({
        user_id: userId,
        name: file.name,
        file_path: filePath,
        mime_type: file.type,
        status: 'ready',
        storage_type: 'supabase',
        is_public: false
      }).select().single();

      if (dbError) {
        console.error("Supabase Final DB Sync Failure:", dbError);
        throw new Error(`Storage Success but DB Indexing Failed: ${dbError.message}`);
      }

      return NextResponse.json({
        id: dbData.id,
        name: dbData.name,
        filePath: dbData.file_path,
        mimeType: dbData.mime_type,
        storage: 'supabase',
        isPublic: false
      });
    } catch (supabaseError: any) {
      console.error("Supabase Primary Failure:", supabaseError);
      return NextResponse.json({ 
        error: `Institutional Storage Unavailable: ${supabaseError.message}` 
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Unified Upload Gateway Error:', error);
    return NextResponse.json({ 
      error: error.message || 'The neural gateway encountered a physical ingestion error.' 
    }, { status: 500 });
  }
}
