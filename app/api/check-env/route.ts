import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    API_KEY_EXISTS: !!process.env.API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV || 'local',
    
    // Scavenger helpers
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    r2Configured: !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
  };

  const isConfigured = !!(env.supabaseUrl && env.supabaseKey);

  return NextResponse.json({
    status: isConfigured ? 'OK' : 'CONFIGURATION_MISSING',
    timestamp: new Date().toISOString(),
    config: {
      url: env.supabaseUrl,
      key: env.supabaseKey
    },
    diagnostics: {
      urlExists: env.NEXT_PUBLIC_SUPABASE_URL,
      keyExists: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      r2Active: env.r2Configured
    },
    resolution: isConfigured 
      ? "Infrastructure verified on server. Client-side bridging active."
      : "CRITICAL: Keys missing on server. Check Vercel Environment Variables immediately."
  });
}