import { NextRequest, NextResponse } from 'next/server';
import {
  extractRequestIp,
  getGuestQuotaStatus,
  hashClientIp,
  mintGuestToken,
  verifyCaptchaChallenge,
} from '../../../../lib/auth/guest-token';
import { kv } from '../../../../lib/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const ip = extractRequestIp(req.headers);
    const ipHash = hashClientIp(ip);
    const attemptKey = `auth:captcha:attempts:${ipHash}`;
    const attempts = await kv.incr(attemptKey, 600).catch(() => 1);
    if (attempts > 15) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait a few minutes or sign in.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid verification request.' }, { status: 400 });
    }

    const { challengeToken, answer, hp } = body as {
      challengeToken?: string;
      answer?: string;
      hp?: string;
    };

    const result = await verifyCaptchaChallenge({
      challengeToken: challengeToken || '',
      answer: String(answer ?? ''),
      honeypot: typeof hp === 'string' ? hp : '',
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'Verification failed.' },
        { status: 400 }
      );
    }

    const minted = mintGuestToken();
    const quota = await getGuestQuotaStatus({
      guestId: minted.guestId,
      clientIp: ip,
    });

    if (!quota.allowed) {
      return NextResponse.json(
        {
          error:
            'Daily guest preview allowance reached from this network. Please create a free educator account to continue with 25 daily syntheses.',
          code: 'QUOTA_EXCEEDED',
          quota,
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        guestToken: minted.guestToken,
        guestId: minted.guestId,
        expiresAt: minted.expiresAt,
        quota,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err: any) {
    console.error('❌ [GuestVerify]:', err?.message || err);
    return NextResponse.json(
      { error: 'Unable to complete verification right now.' },
      { status: 500 }
    );
  }
}
