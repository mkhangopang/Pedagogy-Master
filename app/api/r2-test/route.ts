
import { NextRequest, NextResponse } from 'next/server';
import { r2Client, BUCKET_NAME } from '../../../lib/r2';
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { supabase } from '../../../lib/supabase';
import { ADMIN_EMAILS } from '../../../constants';

/**
 * DIAGNOSTIC: R2 Connectivity Test
 * Restricted to App Admins only.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser(token);
    const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);
    
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 1,
    });

    const response = await r2Client.send(command);

    return NextResponse.json({
      status: 'connected',
      bucket: BUCKET_NAME,
      region: 'auto',
      accessible: true,
      metadata: response.$metadata
    });
  } catch (err: any) {
    return NextResponse.json({
      status: 'error',
      message: err.message,
      code: err.code || err.$metadata?.httpStatusCode
    }, { status: 500 });
  }
}
