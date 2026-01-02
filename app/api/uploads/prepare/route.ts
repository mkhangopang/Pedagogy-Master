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
  try {
    // 1. Validate Environment
    if (!process.env.R2_ENDPOINT || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Critical: Missing R2_ENDPOINT or SUPABASE_SERVICE_ROLE_KEY");
      return NextResponse.json({ 
        error: 'Server configuration error: Missing R2 or Supabase keys.' 
      }, { status: 500 });
    }

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) return NextResponse.json({ error: 'Session required' }, { status: 401 });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });

    const { filename, contentType, fileSize } = await req.json();

    // 2. Quota Enforcement
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.warn("Profile fetch error, defaulting to FREE quota:", profileError.message);
    }
    
    const userPlan = (profile?.plan as SubscriptionPlan) || SubscriptionPlan.FREE;
    if (fileSize > QUOTAS[userPlan]) {
      return NextResponse.json({ 
        error: `File size exceeds your ${userPlan} plan limit (${QUOTAS[userPlan] / 1024 / 1024}MB).` 
      }, { status: 403 });
    }

    // 3. Generate Cloudflare R2 Key
    const timestamp = Date.now();
    const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `${user.id}/${timestamp}_${sanitizedName}`;

    // 4. Request Signed PUT URL from R2
    let uploadUrl;
    try {
      uploadUrl = await getUploadPresignedUrl(key, contentType);
    } catch (r2Error: any) {
      console.error("R2 Signed URL Error:", r2Error);
      return NextResponse.json({ error: "Storage handshake failed. Verify R2 credentials." }, { status: 500 });
    }

    // 5. Create "uploading" Metadata Record (Privileged)
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

    if (dbError) {
      console.error("Database Metadata Insert Failed:", dbError);
      // If table doesn't exist, this is the most likely spot for a 500
      return NextResponse.json({ 
        error: `Metadata storage failed. Ensure SQL tables are created. (${dbError.message})` 
      }, { status: 500 });
    }

    return NextResponse.json({ uploadUrl, key, docId });
  } catch (err: any) {
    console.error("Preparation Route Crash:", err);
    return NextResponse.json({ error: "Internal server error during upload preparation." }, { status: 500 });
  }
}