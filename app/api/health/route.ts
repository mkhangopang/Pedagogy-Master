import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../lib/r2';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { SchemaManager } from '../../../lib/cache/schema-manager';
import { orchestrator } from '../../../lib/ai/model-orchestrator';

export const dynamic = 'force-dynamic';

/**
 * Global Health Monitor (v2.0 - RALPH EDITION)
 * Diagnoses critical infrastructure dependencies:
 * 1. Schema Sync (FP-01)
 * 2. Orchestrator Stats
 * 3. Supabase & R2 status
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  const schemaManager = new SchemaManager(supabase);
  
  const [syncState, supabaseRes, r2Res] = await Promise.all([
    schemaManager.validateSyncState(),
    supabase.from('profiles').select('id').limit(1),
    isR2Configured() && r2Client ? r2Client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 1 })) : Promise.resolve(null)
  ]);

  const envCheck = {
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    geminiKey: !!process.env.API_KEY,
    r2AccountId: !!process.env.R2_ACCOUNT_ID,
    schemaSynced: syncState.inSync
  };

  const results = {
    supabase: { status: supabaseRes.error ? 'error' : 'operational', message: supabaseRes.error?.message || 'Interface responsive.' },
    r2: { status: r2Res ? 'operational' : 'degraded', message: r2Res ? 'Storage online.' : 'Storage unreachable or unconfigured.' },
    orchestrator: {
      flashLatency: orchestrator.getAverageLatency('gemini-3-flash-preview'),
      proLatency: orchestrator.getAverageLatency('gemini-3-pro-preview')
    }
  };

  const isHealthy = syncState.inSync && !supabaseRes.error && !!r2Res;

  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'unstable',
    timestamp,
    environment_checks: envCheck,
    services: results,
    schema_diagnostic: syncState
  }, {
    status: isHealthy ? 200 : 503
  });
}
