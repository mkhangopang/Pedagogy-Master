import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseServerClient(token);
  const { data: { user } } = await supabase.auth.getUser(token);
  
  const adminString = process.env.ADMIN_EMAILS || '';
  const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!user || !adminEmails.includes((user.email || '').toLowerCase())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Broad search across possible environment key names
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

  const env = {
    NEXT_PUBLIC_SUPABASE_URL_PRESENT: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_URL_PRESENT: !!process.env.SUPABASE_URL,
    GEMINI_KEY_PRESENT: !!(process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.API_KEY),
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV || 'local',
    r2Configured: !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
  };

  const isConfigured = !!(supabaseUrl && supabaseKey);

  // MASK SENSITIVE KEYS FOR PRODUCTION AUDIT
  const mask = (str: string) => str ? `${str.substring(0, 8)}...${str.substring(str.length - 4)}` : '';

  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  const finalUrl = isProd ? mask(supabaseUrl) : supabaseUrl;
  const finalKey = isProd ? mask(supabaseKey) : supabaseKey;

  return NextResponse.json({
    status: isConfigured ? 'OK' : 'CONFIGURATION_MISSING',
    timestamp: new Date().toISOString(),
    config: {
      url: finalUrl,
      key: finalKey
    },
    diagnostics: env,
    resolution: isConfigured 
      ? "Infrastructure verified on server. Client-side re-sync protocol active."
      : "CRITICAL: Keys missing on server process. Ensure variables are set and a NEW DEPLOYMENT was triggered."
  });
}