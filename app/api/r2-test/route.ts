
import { NextRequest, NextResponse } from 'next/server';
import { isR2Configured, r2Client, R2_BUCKET } from '../../../lib/r2';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSupabaseServerClient } from '../../../lib/supabase';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseServer = getSupabaseServerClient(token);
  const { data: { user } } = await supabaseServer.auth.getUser(token);
  
  const adminString = process.env.ADMIN_EMAILS || '';
  const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!user || !adminEmails.includes((user.email || '').toLowerCase())) {
    return NextResponse.json({ error: 'Founder Access Required' }, { status: 403 });
  }

  if (!isR2Configured()) {
    return NextResponse.json({ 
      status: 'disabled', 
      message: 'Cloudflare R2 credentials are not set in the environment.' 
    });
  }

  try {
    await r2Client!.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 1 }));
    return NextResponse.json({ 
      status: 'active', 
      message: 'Cloudflare R2 is fully operational.',
      bucket: R2_BUCKET 
    });
  } catch (err: any) {
    return NextResponse.json({ 
      status: 'error', 
      message: err.message 
    }, { status: 500 });
  }
}
