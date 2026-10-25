import { NextRequest, NextResponse } from 'next/server';
import { getCredentials, isSupabaseConfigured } from '../../../lib/supabase';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash') || searchParams.get('token');
  const type = searchParams.get('type');
  const next = searchParams.get('next');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Handle errors reported by Supabase Auth in redirect
  if (error || errorDescription) {
    const errorMsg = errorDescription || error || 'Authentication link failed';
    const destination = type === 'recovery' ? '/reset-password' : '/';
    return NextResponse.redirect(`${origin}${destination}?error=${encodeURIComponent(errorMsg)}`);
  }

  if (isSupabaseConfigured()) {
    const { url, key } = getCredentials();
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // 1. Handle PKCE code exchange
    if (code) {
      try {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!exchangeError && data?.session) {
          const redirectUrl = new URL(type === 'recovery' ? '/reset-password' : (next || '/'), origin);
          // Append session info to hash so client picks it up immediately
          redirectUrl.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&type=${type || 'bearer'}`;
          return NextResponse.redirect(redirectUrl.toString());
        }
      } catch (e) {
        console.warn('⚠️ [Callback Route] Code exchange notice:', e);
      }
    }

    // 2. Handle token hash verification (email verification links)
    if (tokenHash && type) {
      try {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as any
        });
        if (!verifyError && data?.session) {
          const redirectUrl = new URL(type === 'recovery' ? '/reset-password' : (next || '/'), origin);
          redirectUrl.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&type=${type}`;
          return NextResponse.redirect(redirectUrl.toString());
        }
      } catch (e) {
        console.warn('⚠️ [Callback Route] Token hash verification notice:', e);
      }
    }
  }

  // Fallback: redirect to target destination forwarding original search params
  const targetPath = type === 'recovery' ? '/reset-password' : (next || '/');
  return NextResponse.redirect(`${origin}${targetPath}${req.nextUrl.search}`);
}
