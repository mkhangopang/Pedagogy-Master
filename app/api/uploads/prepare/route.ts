import { NextRequest, NextResponse } from 'next/server';
import { supabase, createPrivilegedClient } from '../../../../lib/supabase';
import { getUploadPresignedUrl } from '../../../../lib/r2';
import { SubscriptionPlan } from '../../../../types';

const QUOTAS = {
  [SubscriptionPlan.FREE]: 10 * 1024 * 1024, // 10MB
  [SubscriptionPlan.PRO]: 500 * 1024 * 1024, // 500MB
  [SubscriptionPlan.ENTERPRISE]: 5000 * 1024 * 1024, // 5GB placeholder for unlimited
};

/**
 * UPLOAD PHASE 1: PREPARE
 * Enforces limits and creates a locked metadata record.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) return NextResponse.json({ error: 'Session required' }, { status: 401 });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Auth failed' }, { status: 401 });

    const { filename, contentType, fileSize } = await req.json();

    // 1. Quota Enforcement
    const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
    const userPlan = (profile?.plan as SubscriptionPlan) || SubscriptionPlan.FREE;
    
    if (fileSize > QUOTAS[userPlan]) {
      return NextResponse.json({ 
        error: `File size exceeds ${userPlan} plan limit.` 
      }, { status: 403 });
    }

    // 2. Generate Cloudflare R2 Key
    const timestamp = Date.now();
    const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `${user.id}/${timestamp}_${sanitizedName}`;

    // 3. Request Signed PUT URL from R2
    const uploadUrl = await getUploadPresignedUrl(key, contentType);

    // 4. Create "uploading" Metadata Record (Privileged)
    const admin = createPrivilegedClient();
    const docId = crypto.randomUUID();
    
    const { error: dbError } = await admin.from('documents').insert({
      id: docId,
      user_id: user.id,
      name: filename,
      file_path: key,
      mime_type: contentType,
      status: 'uploading',
      subject: 'General',
      grade_level: 'Auto',
      slo_tags: [],
      created_at: new Date().toISOString()
    });

    if (dbError) throw new Error(`Metadata Error: ${dbError.message}`);

    return NextResponse.json({ uploadUrl, key, docId });
  } catch (err: any) {
    console.error("Upload Prep Failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
