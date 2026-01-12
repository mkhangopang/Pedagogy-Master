import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../lib/r2';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

/**
 * Global Health Monitor
 * Diagnoses critical infrastructure dependencies:
 * 1. Environment variables (Critical for initialization)
 * 2. Supabase (PostgreSQL & Auth connectivity)
 * 3. Cloudflare R2 (Object Storage availability)
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  
  // Environment check for diagnostic reporting
  const envCheck = {
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    geminiKey: !!(process.env.API_KEY || (process.env as any).GEMINI_API_KEY),
    r2AccountId: !!process.env.R2_ACCOUNT_ID,
    r2AccessKey: !!process.env.R2_ACCESS_KEY_ID,
    r2SecretKey: !!process.env.R2_SECRET_ACCESS_KEY,
    r2BucketName: !!process.env.R2_BUCKET_NAME,
    r2PublicUrl: !!process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
  };

  const results = {
    supabase: { status: 'checking', message: '' },
    r2: { status: 'checking', message: '' }
  };

  // 1. Supabase Health Check
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      results.supabase = { 
        status: error.code === '42P01' ? 'degraded' : 'error', 
        message: `Database error [${error.code}]: ${error.message}` 
      };
    } else {
      results.supabase = { 
        status: 'operational', 
        message: 'PostgreSQL interface is responsive.' 
      };
    }
  } catch (err: any) {
    results.supabase = { 
      status: 'down', 
      message: err.message || 'Fatal connection failure to Supabase' 
    };
  }

  // 2. R2 Health Check
  if (!isR2Configured()) {
    results.r2 = { 
      status: 'unconfigured', 
      message: 'Cloudflare R2 credentials missing.' 
    };
  } else if (!r2Client) {
    results.r2 = { 
      status: 'error', 
      message: 'R2 client failed to initialize.' 
    };
  } else {
    try {
      await r2Client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 1 }));
      results.r2 = { status: 'operational', message: 'Cloudflare R2 storage is fully operational.' };
    } catch (err: any) {
      results.r2 = { status: 'error', message: `R2 node rejected request: ${err.message}` };
    }
  }

  const allVarsPresent = Object.values(envCheck).every(v => v === true);
  const isHealthy = results.supabase.status === 'operational' && allVarsPresent;

  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'unstable',
    timestamp,
    environment_checks: envCheck,
    services: results,
    uptime_diagnostics: {
      platform: process.env.VERCEL_ENV || 'local',
      region: process.env.VERCEL_REGION || 'unknown'
    }
  }, {
    status: isHealthy ? 200 : (allVarsPresent ? 503 : 412)
  });
}