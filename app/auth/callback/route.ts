import { NextRequest, NextResponse } from 'next/server';
import { getCredentials, isSupabaseConfigured } from '../../../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { formatAuthError } from '../../../lib/auth/auth-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeRedirectPath(nextParam: string | null): string {
  if (!nextParam) return '/';
  const trimmed = nextParam.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return '/';
  }
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  } catch {
    return '/';
  }
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash') || searchParams.get('token');
  const type = searchParams.get('type');
  const safeNext = sanitizeRedirectPath(searchParams.get('next'));
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Handle errors reported by Supabase Auth in redirect
  if (error || errorDescription) {
    const errorMsg = formatAuthError(errorDescription || error, 'Authentication link failed');
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
          const redirectUrl = new URL(type === 'recovery' ? '/reset-password' : safeNext, origin);
          // Append session info to hash so client picks it up immediately
          redirectUrl.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&type=${type || 'bearer'}`;
          return NextResponse.redirect(redirectUrl.toString());
        }
        if (exchangeError) {
          const destination = type === 'recovery' ? '/reset-password' : '/';
          return NextResponse.redirect(
            `${origin}${destination}?error=${encodeURIComponent(formatAuthError(exchangeError, 'Verification link expired or already used'))}`
          );
        }
      } catch (e: any) {
        console.warn('⚠️ [Callback Route] Code exchange notice:', e);
        const destination = type === 'recovery' ? '/reset-password' : '/';
        return NextResponse.redirect(
          `${origin}${destination}?error=${encodeURIComponent(formatAuthError(e, 'Unable to verify authentication code'))}`
        );
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
          const redirectUrl = new URL(type === 'recovery' ? '/reset-password' : safeNext, origin);
          redirectUrl.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&type=${type}`;
          return NextResponse.redirect(redirectUrl.toString());
        }
        if (verifyError) {
          const destination = type === 'recovery' ? '/reset-password' : '/';
          return NextResponse.redirect(
            `${origin}${destination}?error=${encodeURIComponent(formatAuthError(verifyError, 'Verification link expired or invalid'))}`
          );
        }
      } catch (e: any) {
        console.warn('⚠️ [Callback Route] Token hash verification notice:', e);
        const destination = type === 'recovery' ? '/reset-password' : '/';
        return NextResponse.redirect(
          `${origin}${destination}?error=${encodeURIComponent(formatAuthError(e, 'Unable to verify email token'))}`
        );
      }
    }
  }

  // Fallback: redirect to safe same-origin destination without forwarding unsafe next values
  const targetPath = type === 'recovery' ? '/reset-password' : safeNext;
  const fallbackParams = new URLSearchParams(searchParams.toString());
  if (fallbackParams.has('next') && safeNext === '/') {
    fallbackParams.delete('next');
  }
  const queryString = fallbackParams.toString();
  const redirectUrl = new URL(targetPath, origin);
  if (queryString && !redirectUrl.search) {
    redirectUrl.search = `?${queryString}`;
  }
  return NextResponse.redirect(redirectUrl.toString());
}
