import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const kvStore = new Map<string, number | boolean>();

vi.mock('../../lib/kv', () => ({
  kv: {
    get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
    set: vi.fn(async (key: string, val: any) => {
      kvStore.set(key, val);
    }),
    incr: vi.fn(async (key: string) => {
      const next = (Number(kvStore.get(key)) || 0) + 1;
      kvStore.set(key, next);
      return next;
    }),
    delete: vi.fn(async (key: string) => {
      kvStore.delete(key);
    }),
  },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
          limit: async () => ({ data: [] }),
        }),
      }),
    })),
  },
  getSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  })),
}));

const mockGenerateStream = vi.fn(async function* (..._args: any[]): AsyncGenerator<string> {
  yield 'Sample lesson plan output';
});

vi.mock('../../lib/ai/multi-provider-router', () => ({
  generateAIResponseStream: (...args: any[]) => mockGenerateStream(...args),
}));

function decodeAnswerFromChallenge(imageDataUrl: string): number {
  const b64 = imageDataUrl.replace(/^data:image\/svg\+xml;base64,/, '');
  const svg = Buffer.from(b64, 'base64').toString('utf8');
  const chars = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]).join('');
  const match = chars.match(/(\d+)\s*([+-])\s*(\d+)/);
  if (!match) throw new Error(`Could not parse SVG math expression: ${chars}`);
  const a = parseInt(match[1], 10);
  const b = parseInt(match[3], 10);
  return match[2] === '+' ? a + b : a - b;
}

describe('Guest Mode & Human Security CAPTCHA', () => {
  beforeEach(() => {
    kvStore.clear();
    vi.clearAllMocks();
    process.env.GUEST_TOKEN_SECRET = 'test-guest-secret-32-chars-minimum-length';
  });

  it('creates an SVG math challenge and enforces single-use, honeypot, timing, and signature checks', async () => {
    const {
      createCaptchaChallenge,
      verifyCaptchaChallenge,
      CAPTCHA_TTL_SECONDS,
    } = await import('./guest-token');

    const issuedAt = Date.now() - 10_000;
    const challenge = createCaptchaChallenge(issuedAt);
    expect(challenge.challengeToken).toContain('.');
    expect(challenge.imageDataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);

    const expectedAnswer = decodeAnswerFromChallenge(challenge.imageDataUrl);

    // Reject honeypot
    const hpRes = await verifyCaptchaChallenge({
      challengeToken: challenge.challengeToken,
      answer: String(expectedAnswer),
      honeypot: 'http://spam.example.com',
      nowMs: issuedAt + 2000,
    });
    expect(hpRes.ok).toBe(false);

    // Reject instant bot solve (<400ms)
    const fastRes = await verifyCaptchaChallenge({
      challengeToken: challenge.challengeToken,
      answer: String(expectedAnswer),
      nowMs: issuedAt + 50,
    });
    expect(fastRes.ok).toBe(false);

    // Reject wrong numeric answer
    const wrongRes = await verifyCaptchaChallenge({
      challengeToken: challenge.challengeToken,
      answer: String(expectedAnswer + 7),
      nowMs: issuedAt + 2000,
    });
    expect(wrongRes.ok).toBe(false);

    // Reject tampered signature
    const tampered = challenge.challengeToken.slice(0, -4) + 'AAAA';
    const tamperedRes = await verifyCaptchaChallenge({
      challengeToken: tampered,
      answer: String(expectedAnswer),
      nowMs: issuedAt + 2000,
    });
    expect(tamperedRes.ok).toBe(false);

    // Reject expired challenge
    const expiredRes = await verifyCaptchaChallenge({
      challengeToken: challenge.challengeToken,
      answer: String(expectedAnswer),
      nowMs: issuedAt + CAPTCHA_TTL_SECONDS * 1000 + 5000,
    });
    expect(expiredRes.ok).toBe(false);

    // Valid answer succeeds once
    const validRes = await verifyCaptchaChallenge({
      challengeToken: challenge.challengeToken,
      answer: String(expectedAnswer),
      nowMs: issuedAt + 2000,
    });
    expect(validRes.ok).toBe(true);

    // Replay of same challenge fails
    const replayRes = await verifyCaptchaChallenge({
      challengeToken: challenge.challengeToken,
      answer: String(expectedAnswer),
      nowMs: issuedAt + 2500,
    });
    expect(replayRes.ok).toBe(false);
  });

  it('mints HMAC-signed guest tokens and enforces session (5) and IP (8) quotas', async () => {
    const {
      mintGuestToken,
      verifyGuestToken,
      consumeGuestQuota,
      GUEST_SESSION_QUERY_LIMIT,
      GUEST_IP_DAILY_LIMIT,
    } = await import('./guest-token');

    const minted = mintGuestToken();
    const verified = verifyGuestToken(minted.guestToken);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe(minted.guestId);
    expect(verified?.role).toBe('guest');

    expect(verifyGuestToken(minted.guestToken + 'x')).toBeNull();
    expect(verifyGuestToken('not-a-guest-token')).toBeNull();

    const ip = '203.0.113.10';
    for (let i = 0; i < GUEST_SESSION_QUERY_LIMIT; i++) {
      const q = await consumeGuestQuota({ guestId: minted.guestId, clientIp: ip });
      expect(q.allowed).toBe(true);
    }

    // 6th call in same session must be blocked
    const blockedSession = await consumeGuestQuota({ guestId: minted.guestId, clientIp: ip });
    expect(blockedSession.allowed).toBe(false);
    expect(blockedSession.remaining).toBe(0);

    // Second guest session from same IP only has (8 - 5 = 3) calls remaining
    const second = mintGuestToken();
    for (let i = 0; i < GUEST_IP_DAILY_LIMIT - GUEST_SESSION_QUERY_LIMIT; i++) {
      const q = await consumeGuestQuota({ guestId: second.guestId, clientIp: ip });
      expect(q.allowed).toBe(true);
    }
    const blockedIp = await consumeGuestQuota({ guestId: second.guestId, clientIp: ip });
    expect(blockedIp.allowed).toBe(false);
    expect(blockedIp.reason).toBe('guest_ip_limit');
  });

  it('handles /api/auth/guest-captcha, /api/auth/guest-verify, /api/quota, /api/ai, and /api/chat for guests', async () => {
    const { GET: getCaptcha } = await import('../../app/api/auth/guest-captcha/route');
    const { POST: verifyCaptcha } = await import('../../app/api/auth/guest-verify/route');
    const { GET: getQuota } = await import('../../app/api/quota/route');
    const { POST: postAi } = await import('../../app/api/ai/route');
    const { POST: postChat } = await import('../../app/api/chat/route');
    const { createCaptchaChallenge } = await import('./guest-token');

    const captchaRes = await getCaptcha(
      new NextRequest('http://localhost:3000/api/auth/guest-captcha', {
        headers: { 'x-forwarded-for': '198.51.100.2' },
      })
    );
    expect(captchaRes.status).toBe(200);
    const captchaData = await captchaRes.json();
    expect(captchaData.imageDataUrl).toContain('data:image/svg+xml;base64,');

    // Use a challenge backdated by 2 seconds so solve time passes MIN_SOLVE_MS cleanly
    const olderIssued = Date.now() - 2000;
    const olderChallenge = createCaptchaChallenge(olderIssued);
    const ans = decodeAnswerFromChallenge(olderChallenge.imageDataUrl);

    const verifyRes = await verifyCaptcha(
      new NextRequest('http://localhost:3000/api/auth/guest-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.3' },
        body: JSON.stringify({
          challengeToken: olderChallenge.challengeToken,
          answer: String(ans),
          hp: '',
        }),
      })
    );
    expect(verifyRes.status).toBe(200);
    const { guestToken } = await verifyRes.json();
    expect(guestToken).toMatch(/^pm_guest_/);

    // /api/quota accepts valid guest token, rejects forged token
    const quotaOk = await getQuota(
      new NextRequest('http://localhost:3000/api/quota', {
        headers: { Authorization: `Bearer ${guestToken}` },
      })
    );
    expect(quotaOk.status).toBe(200);
    const quotaJson = await quotaOk.json();
    expect(quotaJson.quota.isGuest).toBe(true);
    expect(quotaJson.quota.limit).toBe(5);

    const quotaForged = await getQuota(
      new NextRequest('http://localhost:3000/api/quota', {
        headers: { Authorization: 'Bearer pm_guest_forged.token123456' },
      })
    );
    expect(quotaForged.status).toBe(401);

    // /api/ai strips priorityDocumentId for guests and counts toward 5-request cap
    const aiRes = await postAi(
      new NextRequest('http://localhost:3000/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${guestToken}`,
          'x-forwarded-for': '198.51.100.3',
        },
        body: JSON.stringify({
          toolType: 'master_plan',
          userInput: 'Photosynthesis 5E lesson',
          priorityDocumentId: '11111111-1111-4111-8111-111111111111',
        }),
      })
    );
    expect(aiRes.status).toBe(200);
    expect(mockGenerateStream).toHaveBeenCalledTimes(1);
    expect(mockGenerateStream.mock.calls[0][8]).toBeUndefined(); // priorityDocumentId stripped
    expect(mockGenerateStream.mock.calls[0][9]).toMatchObject({ isGuest: true });

    // Consume remaining 4 guest runs on /api/chat
    for (let i = 0; i < 4; i++) {
      const r = await postChat(
        new NextRequest('http://localhost:3000/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${guestToken}`,
            'x-forwarded-for': '198.51.100.3',
          },
          body: JSON.stringify({ message: `Chat turn ${i + 1}` }),
        })
      );
      expect(r.status).toBe(200);
    }

    // 6th call across AI/Chat returns 429 QUOTA_EXCEEDED
    const depletedRes = await postChat(
      new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${guestToken}`,
          'x-forwarded-for': '198.51.100.3',
        },
        body: JSON.stringify({ message: 'One too many' }),
      })
    );
    expect(depletedRes.status).toBe(429);
    const depletedJson = await depletedRes.json();
    expect(depletedJson.code).toBe('QUOTA_EXCEEDED');
    expect(depletedJson.isGuest).toBe(true);
  });
});
