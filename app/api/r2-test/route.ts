
import { NextResponse } from 'next/server';
import { isR2Configured, r2Client, R2_BUCKET } from '../../../lib/r2';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

export async function GET() {
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
