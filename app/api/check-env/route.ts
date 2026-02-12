import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Broad search across possible environment key names
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

  const env = {
    NEXT_PUBLIC_SUPABASE_URL_PRESENT: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_URL_PRESENT: !!process.env.SUPABASE_URL,
    API_KEY_EXISTS: !!process.env.API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV || 'local',
    r2Configured: !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
  };

  const isConfigured = !!(supabaseUrl && supabaseKey);

  return NextResponse.json({
    status: isConfigured ? 'OK' : 'CONFIGURATION_MISSING',
    timestamp: new Date().toISOString(),
    config: {
      url: supabaseUrl,
      key: supabaseKey
    },
    diagnostics: env,
    resolution: isConfigured 
      ? "Infrastructure verified on server. Client-side re-sync protocol active."
      : "CRITICAL: Keys missing on server process. Ensure variables are set and a NEW DEPLOYMENT was triggered."
  });
}