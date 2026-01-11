import { NextResponse } from 'next/server';

export async function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    API_KEY_EXISTS: !!process.env.API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV || 'local',
    
    // Safety check: expose only metadata
    supabaseUrlPreview: process.env.NEXT_PUBLIC_SUPABASE_URL 
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 25)}...` 
      : 'NOT_FOUND',
    keyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0
  };

  const isConfigured = env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return NextResponse.json({
    status: isConfigured ? 'OK' : 'CONFIGURATION_MISSING',
    timestamp: new Date().toISOString(),
    diagnostics: env,
    resolution: isConfigured 
      ? "Infrastructure verified. If Gemini is still disabled, ensure process.env.API_KEY is set."
      : "Verify that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set and you have REDEPLOYED."
  });
}
