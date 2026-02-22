// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../lib/r2';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { SchemaManager } from '../../../lib/cache/schema-manager';
import { neuralGrid } from '../../../lib/ai/model-orchestrator';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  const schemaManager = new SchemaManager(supabase);

  const [syncState, supabaseRes, r2Res] = await Promise.all([
    schemaManager.validateSyncState(),
    supabase.from('profiles').select('id').limit(1),
    isR2Configured() && r2Client
      ? r2Client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 1 }))
      : Promise.resolve(null)
  ]);

  const gridStatus = neuralGrid.getGridStatus();

  const envCheck = {
    supabaseUrl:   !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    geminiKey:     !!process.env.API_KEY,
    deepseekKey:   !!process.env.DEEPSEEK_API_KEY,
    groqKey:       !!process.env.GROQ_API_KEY,
    cerebrasKey:   !!process.env.CEREBRAS_API_KEY,
    sambanovaKey:  !!process.env.SAMBANOVA_API_KEY,
    openrouterKey: !!process.env.OPENROUTER_API_KEY,
    r2AccountId:   !!process.env.R2_ACCOUNT_ID,
    schemaSynced:  syncState.inSync,
  };

  const onlineEngines = gridStatus.filter(e => e.status === 'ONLINE').length;

  const results = {
    supabase: {
      status: supabaseRes.error ? 'error' : 'operational',
      message: supabaseRes.error?.message || 'Interface responsive.',
    },
    r2: {
      status: r2Res ? 'operational' : 'degraded',
      message: r2Res ? 'Storage online.' : 'Storage unreachable or unconfigured.',
    },
    neuralGrid: {
      totalEngines: gridStatus.length,
      onlineEngines,
      engines: gridStatus.map(e => ({
        name:     e.displayName,
        provider: e.provider,
        status:   e.status,
        tasks:    e.tasks,
      })),
    },
  };

  const isHealthy = syncState.inSync && !supabaseRes.error && !!r2Res && onlineEngines >= 2;

  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'unstable',
    timestamp,
    environment_checks: envCheck,
    services: results,
    schema_diagnostic: syncState,
  }, {
    status: isHealthy ? 200 : 503,
  });
}
