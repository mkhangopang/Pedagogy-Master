
import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../lib/r2';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

/**
 * Global Health Monitor
 * Diagnoses critical infrastructure dependencies:
 * 1. Supabase (PostgreSQL & Auth connectivity)
 * 2. Cloudflare R2 (Object Storage availability)
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  
  const results = {
    supabase: { status: 'checking', message: '' },
    r2: { status: 'checking', message: '' }
  };

  // 1. Supabase Health Check
  try {
    // Attempt a light query to verify connectivity and basic schema access
    const { error } = await supabase.from('profiles').select('id').limit(1);
    
    if (error) {
      // Code 42P01 means the table doesn't exist. Degraded, but connected to DB.
      // Other codes usually imply a connection or auth failure.
      results.supabase = { 
        status: error.code === '42P01' ? 'degraded' : 'error', 
        message: `Database error [${error.code}]: ${error.message}` 
      };
    } else {
      results.supabase = { 
        status: 'operational', 
        message: 'PostgreSQL interface is responsive and profiles table is accessible.' 
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
      message: 'Cloudflare R2 environment variables (Account ID, Access Keys) are missing.' 
    };
  } else if (!r2Client) {
    results.r2 = { 
      status: 'error', 
      message: 'R2 client failed to initialize despite having credentials.' 
    };
  } else {
    try {
      // Attempt to list objects to verify bucket access and credentials
      await r2Client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 1 }));
      results.r2 = { 
        status: 'operational', 
        message: `Cloudflare R2 storage node "${R2_BUCKET}" is fully operational.` 
      };
    } catch (err: any) {
      results.r2 = { 
        status: 'error', 
        message: `R2 node rejected request: ${err.message}` 
      };
    }
  }

  // Determine overall system health
  // Unconfigured R2 is considered a 'healthy' state if the app is designed to fall back to Supabase.
  const isHealthy = results.supabase.status === 'operational' && 
                   (results.r2.status === 'operational' || results.r2.status === 'unconfigured');

  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'unstable',
    timestamp,
    services: results,
    uptime_diagnostics: {
      platform: process.env.VERCEL_ENV || 'local',
      region: process.env.VERCEL_REGION || 'unknown'
    }
  }, {
    status: isHealthy ? 200 : 503
  });
}
