import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getCredentials, isSupabaseConfigured } from '../../../../lib/supabase';
import { kv } from '../../../../lib/kv';
import { createClient } from '@supabase/supabase-js';
import { formatAuthError } from '../../../../lib/auth/auth-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECOVERY_WINDOW_SECONDS = 900; // 15 minutes
const MAX_RECOVERY_REQUESTS = 5;
const MAX_OTP_VERIFY_ATTEMPTS = 8;

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
      // fall through to safe server origin
    }
  }

  return reqOrigin && reqOrigin.startsWith('http') ? new URL(reqOrigin).origin : 'http://localhost:3000';
}

async function checkRateLimit(key: string, maxAttempts: number): Promise<boolean> {
  try {
    const count = await kv.incr(key, RECOVERY_WINDOW_SECONDS);
    return count <= maxAttempts;
  } catch {
    return true;
  }
}

/**
 * PRODUCTION AUTH RECOVERY GATEWAY (Hardened)
 * Dispatches official Supabase recovery emails without ever exposing OTPs,
 * action links, or hashed tokens in HTTP responses.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Authentication infrastructure not configured.' }, { status: 503 });
    }

    const body = await req.json();
    const { action, email, otp, newPassword, origin } = body;

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.length > 254) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }

    const { url, key } = getCredentials();
    const clientOrigin = resolveSafeOrigin(origin, req.nextUrl.origin);
    const clientIp = getClientIp(req);

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION 1: REQUEST RECOVERY EMAIL (NO CREDENTIALS RETURNED TO CLIENT)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'request' || !action) {
      const allowed = await checkRateLimit(
        `auth:recover:req:${clientIp}:${cleanEmail}`,
        MAX_RECOVERY_REQUESTS
      );
      if (!allowed) {
        return NextResponse.json(
          { error: 'Too many password reset requests. Please wait 15 minutes and try again.' },
          { status: 429 }
        );
      }

      let rateLimitNotice: string | null = null;
      try {
        const anonClient = createClient(url, key, { auth: { persistSession: false } });
        const { error: emailErr } = await anonClient.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${clientOrigin}/reset-password`
        });

        if (emailErr) {
          console.warn('⚠️ [Auth Recovery] resetPasswordForEmail notice:', emailErr.message);
          if (emailErr.message?.toLowerCase().includes('security') || emailErr.status === 429) {
            rateLimitNotice = 'Please wait a moment before requesting another recovery email.';
          }
        }
      } catch (err: any) {
        console.warn('⚠️ [Auth Recovery] resetPasswordForEmail exception:', err.message);
      }

      if (rateLimitNotice) {
        return NextResponse.json(
          { error: rateLimitNotice, rateLimitNotice },
          { status: 429 }
        );
      }

      // Generic response prevents email enumeration and never leaks OTPs or recovery URLs
      return NextResponse.json({
        success: true,
        emailDispatched: true,
        message: 'If an account exists for that email, password reset instructions have been sent. Please check your inbox and spam folder.'
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION 2: VERIFY OTP / TOKEN FROM EMAIL AND UPDATE PASSWORD
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'verify-otp') {
      const allowed = await checkRateLimit(
        `auth:recover:otp:${clientIp}:${cleanEmail}`,
        MAX_OTP_VERIFY_ATTEMPTS
      );
      if (!allowed) {
        return NextResponse.json(
          { error: 'Too many verification attempts. Please wait 15 minutes before trying again.' },
          { status: 429 }
        );
      }

      let cleanOtp = String(otp || '').trim();
      const cleanPassword = String(newPassword || '').trim();

      // Smart extraction if the user pasted the recovery link from their email
      if (cleanOtp.includes('token=') || cleanOtp.includes('token_hash=')) {
        const tokenMatch = cleanOtp.match(/(?:token|token_hash)=([a-zA-Z0-9_-]+)/);
        if (tokenMatch && tokenMatch[1]) {
          cleanOtp = tokenMatch[1];
        }
      }

      if (!cleanOtp) {
        return NextResponse.json({ error: 'Please enter the verification code or token from your email.' }, { status: 400 });
      }
      if (!cleanPassword || cleanPassword.length < 8) {
        return NextResponse.json({ error: 'New password must be at least 8 characters long.' }, { status: 400 });
      }

      let userId: string | null = null;
      const anonClient = createClient(url, key, { auth: { persistSession: false } });

      // Attempt A: Verify with email + token (standard OTP code emailed to user)
      const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
        email: cleanEmail,
        token: cleanOtp,
        type: 'recovery'
      });

      if (!verifyError && verifyData?.user) {
        userId = verifyData.user.id;
      } else {
        // Attempt B: Verify with token_hash (from emailed action link)
        const { data: hashData, error: hashError } = await anonClient.auth.verifyOtp({
          token_hash: cleanOtp,
          type: 'recovery'
        });

        // Ensure token_hash actually belongs to cleanEmail to prevent cross-account token confusion
        if (!hashError && hashData?.user && hashData.user.email?.toLowerCase() === cleanEmail) {
          userId = hashData.user.id;
        } else {
          console.warn('⚠️ [Auth Recovery] OTP verification failed:', {
            otpErr: verifyError?.message,
            hashErr: hashError?.message
          });
        }
      }

      if (!userId) {
        return NextResponse.json({ 
          error: 'Invalid or expired verification code. Please check your email or request a fresh reset link.' 
        }, { status: 400 });
      }

      const supabaseAdmin = getSupabaseAdminClient();
      const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: cleanPassword
      });

      if (updateError) {
        console.error('❌ [Auth Recovery] Admin updateUserById error:', updateError);
        return NextResponse.json({ error: formatAuthError(updateError, 'Failed to update password.') }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Password updated successfully. You can now sign in with your new password.',
        user: { id: updateData.user.id, email: updateData.user.email }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION 3: RESEND SIGNUP CONFIRMATION
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'resend-signup') {
      const allowed = await checkRateLimit(
        `auth:resend:signup:${clientIp}:${cleanEmail}`,
        MAX_RECOVERY_REQUESTS
      );
      if (!allowed) {
        return NextResponse.json(
          { error: 'Too many resend requests. Please wait 15 minutes before trying again.' },
          { status: 429 }
        );
      }

      const anonClient = createClient(url, key, { auth: { persistSession: false } });
      const { error: resendError } = await anonClient.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: {
          emailRedirectTo: `${clientOrigin}/`
        }
      });

      if (resendError) {
        return NextResponse.json({ error: formatAuthError(resendError, 'Failed to resend confirmation email.') }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: `Activation email resent to ${cleanEmail}. Please check your inbox.`
      });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });

  } catch (error: any) {
    console.error('❌ [Auth Recovery Exception]:', error);
    return NextResponse.json(
      { error: formatAuthError(error, 'Authentication recovery service failed.') },
      { status: 500 }
    );
  }
}
