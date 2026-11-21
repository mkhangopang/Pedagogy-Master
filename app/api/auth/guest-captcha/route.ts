import { NextRequest, NextResponse } from 'next/server';
import {
  createCaptchaChallenge,
  extractRequestIp,
  hashClientIp,
} from '../../../../lib/auth/guest-token';
import { kv } from '../../../../lib/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const ip = extractRequestIp(req.headers);
    const ipHash = hashClientIp(ip);
    const rateKey = `auth:captcha:gen:${ipHash}`;
    const count = await kv.incr(rateKey, 600).catch(() => 1);
    if (count > 30) {
      return NextResponse.json(
        { error: 'Too many verification refreshes. Please wait a few minutes.' },
        { status: 429 }
      );
    }

    const challenge = createCaptchaChallenge();
    return NextResponse.json(challenge, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    console.error('❌ [GuestCaptcha]:', err?.message || err);
    return NextResponse.json(
      { error: 'Could not generate human verification challenge.' },
      { status: 500 }
    );
  }
}
