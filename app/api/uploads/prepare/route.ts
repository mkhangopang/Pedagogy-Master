import { NextRequest, NextResponse } from 'next/server';
import { supabase, createPrivilegedClient } from '../../../../lib/supabase';
import { getUploadPresignedUrl } from '../../../../lib/r2';
import { SubscriptionPlan } from '../../../../types';
import crypto from 'crypto';

const QUOTAS = {
  [SubscriptionPlan.FREE]: 10 * 1024 * 1024, // 10MB
  [SubscriptionPlan.PRO]: 500 * 1024 * 1024, // 500MB
  [SubscriptionPlan.ENTERPRISE]: 5000 * 1024 * 1024, // 5GB
};

export async function POST(req: NextRequest) {
  // Use a controller to enforce a hard timeout on the entire operation
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second limit

  try {
    // 1. Environment Guard
    if (!process.env.R2_ENDPOINT || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Infrastructure configuration missing (R2/Supabase Keys).' }, { status: 500 });
    }

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Session verification failed' }, { status: 401 });

    const { filename, contentType, fileSize } = await req.json();

    // 2. Fetch Profile Quota
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError && profileError.code === '42P01') {
      return NextResponse.json({ error: 'Supabase table "profiles" not found. Run SQL Initialization script.' }, { status: 500 });
    }
    
    const userPlan = (profile?.plan as SubscriptionPlan) || SubscriptionPlan.FREE;
    if (fileSize > QUOTAS[userPlan]) {
      return NextResponse.json({ error: 'File size exceeds plan quota.' }, { status: 403 });
    }

    // 3. R2 Handshake
    const timestamp = Date.now();
    const key = `${user.id}/${timestamp}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    let uploadUrl;
    try {
      uploadUrl = await getUploadPresignedUrl(key, contentType);
    } catch (r2Err: any) {
      console.error("R2 Error:", r2Err);
      return NextResponse.json({ error: 'Cloudflare R2 handshake failed. Check endpoint and keys.' }, { status: 500 });
    }

    // 4. DB Registry Entry
    const admin = createPrivilegedClient();
    const docId = crypto.randomUUID();
    
    const { error: dbError } = await admin.from('documents').insert({
      id: docId,
      user_id: user.id,
      name: filename,
      file_path: key,
      mime_type: contentType,
      status: 'uploading'
    });

    if (dbError) {
      if (dbError.code === '42P01') {
        return NextResponse.json({ error: 'Supabase table "documents" missing. Use Neural Brain to run SQL Patch.' }, { status: 500 });
      }
      return NextResponse.json({ error: `DB Error: ${dbError.message}` }, { status: 500 });
    }

    clearTimeout(timeoutId);
    return NextResponse.json({ uploadUrl, key, docId });

  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    return NextResponse.json({ 
      error: isTimeout ? 'Handshake timed out. Check your database connection.' : 'Internal processing error.' 
    }, { status: 500 });
  }
}