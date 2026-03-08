import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../lib/r2';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { orchestrator } from '../../../lib/ai/model-orchestrator';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();

  const [supabaseRes, r2Res] = await Promise.all([
    supabase.from('profiles').select('id').limit(1),
    isR2Configured() && r2Client
      ? r2Client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 1 }))
      : Promise.resolve(null)
  ]);

  const results = {
    supabase: {
      status: supabaseRes.error ? 'error' : 'operational',
      message: supabaseRes.error?.message || 'Interface responsive.'
    },
    r2: {
      status: r2Res ? 'operational' : 'degraded',
      message: r2Res ? 'Storage online.' : 'Storage unreachable or unconfigured.'
    },
    orchestrator: {
      flashLatency: null,
      proLatency: null
    }
  };

  const isHealthy = !supabaseRes.error && !!r2Res;

  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'unstable',
    timestamp,
    services: results,
  }, { status: isHealthy ? 200 : 503 });
}
