import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getCredentials, isSupabaseConfigured } from '../../../../lib/supabase';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PRODUCTION AUTH RECOVERY GATEWAY
 * Solves Supabase Site URL / redirect whitelist mismatch and device desync
 * by orchestrating official emails, instant local recovery links, and direct OTP validation.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Authentication infrastructure not configured.' }, { status: 503 });
    }

    const body = await req.json();
    const { action, email, otp, newPassword, origin } = body;

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }

    const { url, key } = getCredentials();
    const supabaseAdmin = getSupabaseAdminClient();
    const clientOrigin = origin || req.nextUrl.origin || 'http://localhost:3000';

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION 1: REQUEST RECOVERY LINK & OTP
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'request' || !action) {
      // 1. Generate authoritative recovery link & OTP using Admin client
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: cleanEmail,
        options: {
          redirectTo: `${clientOrigin}/reset-password`
        }
      });

      if (linkError) {
        console.error('❌ [Auth Recovery] Generate link error:', linkError);
        if (linkError.message?.toLowerCase().includes('not found') || linkError.status === 404) {
          return NextResponse.json({ 
            error: `No registered account found with email "${cleanEmail}". Please check your email or create a new account.` 
          }, { status: 404 });
        }
        return NextResponse.json({ error: linkError.message || 'Failed to generate password recovery.' }, { status: 500 });
      }

      const properties = linkData?.properties || {};
      const emailOtp = properties.email_otp || null;
      const hashedToken = properties.hashed_token || null;
      const actionLink = properties.action_link || '';

      // Direct local recovery link for this app environment
      const directLocalUrl = `${clientOrigin}/reset-password?token_hash=${hashedToken || ''}&email=${encodeURIComponent(cleanEmail)}`;

      // 2. Trigger Supabase official email delivery
      let emailDispatched = false;
      let rateLimitNotice: string | null = null;

      try {
        const anonClient = createClient(url, key, { auth: { persistSession: false } });
        const { error: emailErr } = await anonClient.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${clientOrigin}/reset-password`
        });

        if (emailErr) {
          console.warn('⚠️ [Auth Recovery] resetPasswordForEmail notice:', emailErr.message);
          if (emailErr.message?.toLowerCase().includes('security') || emailErr.status === 429) {
            rateLimitNotice = emailErr.message;
          }
        } else {
          emailDispatched = true;
        }
      } catch (err: any) {
        console.warn('⚠️ [Auth Recovery] resetPasswordForEmail exception:', err.message);
      }

      return NextResponse.json({
        success: true,
        message: emailDispatched 
          ? `Password reset email dispatched to ${cleanEmail}.`
          : `Recovery credentials generated for ${cleanEmail}.`,
        email: cleanEmail,
        emailOtp,
        hashedToken,
        actionLink,
        directLocalUrl,
        emailDispatched,
        rateLimitNotice
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION 2: VERIFY OTP / TOKEN AND UPDATE PASSWORD
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'verify-otp') {
      let cleanOtp = String(otp || '').trim();
      const cleanPassword = String(newPassword || '').trim();

      // Smart extraction: if the user pasted a full URL or query string, extract the token
      if (cleanOtp.includes('token=') || cleanOtp.includes('token_hash=')) {
        const tokenMatch = cleanOtp.match(/(?:token|token_hash)=([a-zA-Z0-9_-]+)/);
        if (tokenMatch && tokenMatch[1]) {
          cleanOtp = tokenMatch[1];
        }
      } else if (cleanOtp.includes('#access_token=')) {
        const atMatch = cleanOtp.match(/access_token=([a-zA-Z0-9._-]+)/);
        if (atMatch && atMatch[1]) {
          cleanOtp = atMatch[1];
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

      // Attempt A: Verify with email + token (standard 6-8 digit code)
      const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
        email: cleanEmail,
        token: cleanOtp,
        type: 'recovery'
      });

      if (!verifyError && verifyData?.user) {
        userId = verifyData.user.id;
      } else {
        // Attempt B: Verify with token_hash (from email action link)
        const { data: hashData, error: hashError } = await anonClient.auth.verifyOtp({
          token_hash: cleanOtp,
          type: 'recovery'
        });

        if (!hashError && hashData?.user) {
          userId = hashData.user.id;
        } else {
          console.warn('⚠️ [Auth Recovery] Both verifyOtp attempts failed:', {
            otpErr: verifyError?.message,
            hashErr: hashError?.message
          });
        }
      }

      if (!userId) {
        return NextResponse.json({ 
          error: 'Invalid or expired verification code. Please request a fresh reset link or code.' 
        }, { status: 400 });
      }

      // Authoritatively update password via Admin Client
      const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: cleanPassword
      });

      if (updateError) {
        console.error('❌ [Auth Recovery] Admin updateUserById error:', updateError);
        return NextResponse.json({ error: updateError.message || 'Failed to update password.' }, { status: 500 });
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
      const anonClient = createClient(url, key, { auth: { persistSession: false } });
      const { error: resendError } = await anonClient.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: {
          emailRedirectTo: `${clientOrigin}/`
        }
      });

      if (resendError) {
        return NextResponse.json({ error: resendError.message || 'Failed to resend confirmation email.' }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: `Activation email resent to ${cleanEmail}. Please check your inbox.`
      });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });

  } catch (error: any) {
    console.error('❌ [Auth Recovery Exception]:', error);
    return NextResponse.json({ error: error.message || 'Authentication recovery service failed.' }, { status: 500 });
  }
}
