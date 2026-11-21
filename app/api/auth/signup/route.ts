import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCredentials, getSupabaseAdminClient, isSupabaseConfigured } from '../../../../lib/supabase';
import { kv } from '../../../../lib/kv';
import { formatAuthError } from '../../../../lib/auth/auth-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNUP_WINDOW_SECONDS = 900; // 15 minutes
const MAX_SIGNUP_ATTEMPTS = 8;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

function resolveSafeOrigin(requestedOrigin: unknown, reqOrigin: string): string {
  const allowedOrigins = new Set<string>();
  const candidates = [
    reqOrigin,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL
      ? (process.env.NEXT_PUBLIC_VERCEL_URL.startsWith('http')
          ? process.env.NEXT_PUBLIC_VERCEL_URL
          : `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`)
      : null,
  ];

  for (const c of candidates) {
    if (!c) continue;
    try {
      allowedOrigins.add(new URL(c).origin);
    } catch {
      // ignore invalid env URL
    }
  }

  if (typeof requestedOrigin === 'string' && requestedOrigin.trim()) {
    try {
      const parsed = new URL(requestedOrigin.trim());
      if (allowedOrigins.has(parsed.origin)) {
        return parsed.origin;
      }
    } catch {
      // fall through
    }
  }

  return reqOrigin && reqOrigin.startsWith('http') ? new URL(reqOrigin).origin : 'http://localhost:3000';
}

async function cleanupOrphanedProfileByEmail(email: string): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const admin = getSupabaseAdminClient();
    const { data: rows } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .limit(3);

    if (!rows || rows.length === 0) return false;

    let removedAny = false;
    for (const row of rows) {
      const { data: userRes, error: lookupErr } = await admin.auth.admin.getUserById(row.id);
      if (lookupErr || !userRes?.user) {
        await admin.from('profiles').delete().eq('id', row.id);
        removedAny = true;
      }
    }
    return removedAny;
  } catch {
    return false;
  }
}

/**
 * Same-origin signup fallback for restricted in-app browsers (e.g. Facebook/Instagram WebView)
 * and clean error normalization.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Authentication service is not configured yet. Please contact support.' },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cleanEmail = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const captchaToken = typeof body?.captchaToken === 'string' ? body.captchaToken : undefined;
    const origin = resolveSafeOrigin(body?.origin, req.nextUrl.origin);

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }

    const clientIp = getClientIp(req);
    try {
      const count = await kv.incr(`auth:signup:${clientIp}:${cleanEmail}`, SIGNUP_WINDOW_SECONDS);
      if (count > MAX_SIGNUP_ATTEMPTS) {
        return NextResponse.json(
          { error: 'Too many sign-up attempts. Please wait 15 minutes and try again.' },
          { status: 429 }
        );
      }
    } catch {
      // Do not fail signup if KV store is unavailable
    }

    const { url, key } = getCredentials();
    const anonClient = createClient(url, key, { auth: { persistSession: false } });
    const signUpPayload = {
      email: cleanEmail,
      password,
      options: {
        data: { role: 'teacher', plan: 'free' },
        emailRedirectTo: `${origin}/`,
        ...(captchaToken && captchaToken !== 'verified' ? { captchaToken } : {}),
      },
    };

    let { data, error: authError } = await anonClient.auth.signUp(signUpPayload);

    const errMsg = String((authError as any)?.message || (authError as any)?.msg || '').toLowerCase();
    if (authError && (errMsg.includes('database error saving new user') || (authError as any)?.code === 'unexpected_failure')) {
      const cleaned = await cleanupOrphanedProfileByEmail(cleanEmail);
      if (cleaned) {
        const retry = await anonClient.auth.signUp(signUpPayload);
        data = retry.data;
        authError = retry.error;
      }
    }

    if (authError) {
      console.error('[Auth Signup] Supabase signUp error:', {
        code: (authError as any)?.code,
        status: (authError as any)?.status,
        message: (authError as any)?.message,
      });
      const message = formatAuthError(
        authError,
        'Unable to create your account right now. Please try again in a moment or use Continue with Google.'
      );
      const isExisting =
        message.toLowerCase().includes('already exists') ||
        (authError as any)?.code === 'user_already_exists';
      const statusCode =
        typeof (authError as any)?.status === 'number' && (authError as any).status >= 400
          ? (authError as any).status
          : 400;

      return NextResponse.json(
        {
          error: message,
          code: isExisting ? 'user_already_exists' : (authError as any)?.code,
        },
        { status: isExisting ? 409 : statusCode }
      );
    }

    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return NextResponse.json(
        {
          error: 'An account with this email is already registered. Please Sign In or use Forgot Password.',
          code: 'user_already_exists',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      session: data?.session || null,
      needsEmailConfirmation: Boolean(data?.user && !data?.session),
    });
  } catch (err) {
    const message = formatAuthError(
      err,
      'Unable to create your account right now. Please try again in a moment or use Continue with Google.'
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
