
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { getUploadPresignedUrl } from '../../../../lib/r2';
import { SubscriptionPlan } from '../../../../types';

const QUOTAS = {
  [SubscriptionPlan.FREE]: 10 * 1024 * 1024, // 10MB
  [SubscriptionPlan.PRO]: 500 * 1024 * 1024, // 500MB
  [SubscriptionPlan.ENTERPRISE]: Infinity,
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { filename, contentType, fileSize } = await req.json();

    // 1. Enforce Subscription Quota
    const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
    const userPlan = (profile?.plan as SubscriptionPlan) || SubscriptionPlan.FREE;
    
    if (fileSize > QUOTAS[userPlan]) {
      return NextResponse.json({ 
        error: `File exceeds your plan limit (${QUOTAS[userPlan] / (1024 * 1024)}MB). Please upgrade for more space.` 
      }, { status: 403 });
    }

    // 2. Generate R2 Key
    const timestamp = Date.now();
    const key = `${user.id}/${timestamp}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    // 3. Generate Signed URL
    const uploadUrl = await getUploadPresignedUrl(key, contentType);

    return NextResponse.json({ uploadUrl, key });
  } catch (err: any) {
    console.error("R2 Prep Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
