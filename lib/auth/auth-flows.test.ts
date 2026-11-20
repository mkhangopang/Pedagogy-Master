import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { normalizeAuthEntryMode } from './auth-mode';

const mockExchangeCodeForSession = vi.fn();
const mockVerifyOtp = vi.fn();
const mockResend = vi.fn();
const mockSignUp = vi.fn();
const kvCounts = new Map<string, number>();

vi.mock('../../lib/kv', () => ({
  kv: {
    incr: vi.fn(async (k: string) => {
      const next = (kvCounts.get(k) || 0) + 1;
      kvCounts.set(k, next);
      return next;
    }),
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      verifyOtp: mockVerifyOtp,
      resend: mockResend,
      signUp: mockSignUp,
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}));

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: vi.fn(() => true),
  getCredentials: vi.fn(() => ({
    url: 'https://example.supabase.co',
    key: 'anon-key-placeholder-123456',
  })),
  getSupabaseAdminClient: vi.fn(),
}));

describe('Sign-Up / Sign-In / Callback Auth Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kvCounts.clear();
  });

  it('normalizeAuthEntryMode strictly rejects MouseEvent / invalid inputs and preserves valid modes', () => {
    expect(normalizeAuthEntryMode('login')).toBe('login');
    expect(normalizeAuthEntryMode('signup')).toBe('signup');
    expect(normalizeAuthEntryMode('forgot-password')).toBe('forgot-password');
    expect(normalizeAuthEntryMode('update-password')).toBe('update-password');

    // Simulate accidental React SyntheticEvent passed via onClick={onStart}
    const syntheticMouseEvent = { type: 'click', _reactName: 'onClick', target: {} };
    expect(normalizeAuthEntryMode(syntheticMouseEvent)).toBe('login');
    expect(normalizeAuthEntryMode(undefined)).toBe('login');
    expect(normalizeAuthEntryMode('unknown-mode', 'signup')).toBe('signup');
  });

  it('formatAuthError never exposes raw "{}" or "[object Object]" and humanizes Supabase fetch/5xx errors', async () => {
    const { formatAuthError, isRetryableAuthError } = await import('./auth-error');

    expect(formatAuthError('{}')).not.toContain('{}');
    expect(formatAuthError('[object Object]')).not.toContain('object Object');
    expect(formatAuthError({ name: 'AuthRetryableFetchError', message: '{}', status: 0 })).toContain(
      'Could not connect'
    );
    expect(formatAuthError({ name: 'AuthRetryableFetchError', message: '{}', status: 504 })).toContain(
      'temporary'
    );
    expect(formatAuthError({ message: 'User already registered', status: 422 })).toContain(
      'already exists'
    );
    expect(isRetryableAuthError({ name: 'AuthRetryableFetchError', message: '{}', status: 0 })).toBe(true);
    expect(isRetryableAuthError({ message: '{}' })).toBe(true);
    expect(isRetryableAuthError({ message: 'Invalid login credentials', status: 400 })).toBe(false);
  });

  it('POST /api/auth/signup handles success, existing accounts, and never leaks "{}" on Supabase 5xx', async () => {
    const { POST } = await import('../../app/api/auth/signup/route');

    // 1. Success with email confirmation pending
    mockSignUp.mockResolvedValueOnce({
      data: { user: { id: 'u-1', identities: [{ id: 'i-1' }] }, session: null },
      error: null,
    });
    const okReq = new NextRequest('https://pedagogy-master.vercel.app/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.10' },
      body: JSON.stringify({
        email: 'Teacher@School.Edu',
        password: 'StrongPassword123',
        origin: 'https://evil.example.com',
      }),
    });
    const okRes = await POST(okReq);
    const okJson = await okRes.json();
    expect(okRes.status).toBe(200);
    expect(okJson.success).toBe(true);
    expect(okJson.needsEmailConfirmation).toBe(true);
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'teacher@school.edu',
      password: 'StrongPassword123',
      options: {
        data: { role: 'teacher', plan: 'free' },
        emailRedirectTo: 'https://pedagogy-master.vercel.app/',
      },
    });

    // 2. Supabase AuthRetryableFetchError with "{}" message turns into clear human message
    mockSignUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { name: 'AuthRetryableFetchError', message: '{}', status: 500 },
    });
    const errReq = new NextRequest('https://pedagogy-master.vercel.app/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.11' },
      body: JSON.stringify({
        email: 'another@school.edu',
        password: 'StrongPassword123',
      }),
    });
    const errRes = await POST(errReq);
    const errJson = await errRes.json();
    expect(errRes.status).toBe(500);
    expect(errJson.error).not.toBe('{}');
    expect(errJson.error.length).toBeGreaterThan(15);
  });

  it('POST /api/auth/reset-password resend-signup sanitizes origin and calls supabase resend', async () => {
    mockResend.mockResolvedValueOnce({ error: null });
    const { POST } = await import('../../app/api/auth/reset-password/route');

    const req = new NextRequest('https://pedagogy-master.vercel.app/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.5' },
      body: JSON.stringify({
        action: 'resend-signup',
        email: 'NewTeacher@School.Edu ',
        origin: 'https://evil-phishing.example.com',
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockResend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'newteacher@school.edu',
      options: {
        emailRedirectTo: 'https://pedagogy-master.vercel.app/',
      },
    });
  });

  it('GET /auth/callback routes signup confirmation vs recovery cleanly and surfaces exchange errors', async () => {
    const { GET } = await import('../../app/auth/callback/route');

    // 1. Successful signup token_hash verification routes to root dashboard with tokens
    mockVerifyOtp.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'signup-access-123',
          refresh_token: 'signup-refresh-456',
        },
      },
      error: null,
    });
    const signupReq = new NextRequest(
      'https://pedagogy-master.vercel.app/auth/callback?token_hash=tok123&type=signup'
    );
    const signupRes = await GET(signupReq);
    expect(signupRes.status).toBe(307);
    expect(signupRes.headers.get('location')).toBe(
      'https://pedagogy-master.vercel.app/#access_token=signup-access-123&refresh_token=signup-refresh-456&type=signup'
    );

    // 2. Failed PKCE code exchange surfaces error instead of silent loop
    mockExchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'PKCE code verifier missing' },
    });
    const failedPkceReq = new NextRequest(
      'https://pedagogy-master.vercel.app/auth/callback?code=bad-code'
    );
    const failedPkceRes = await GET(failedPkceReq);
    expect(failedPkceRes.status).toBe(307);
    expect(failedPkceRes.headers.get('location')).toBe(
      'https://pedagogy-master.vercel.app/?error=PKCE%20code%20verifier%20missing'
    );

    // 3. Recovery error redirects to /reset-password with error message
    const recoveryErrReq = new NextRequest(
      'https://pedagogy-master.vercel.app/auth/callback?type=recovery&error_description=Link%20expired'
    );
    const recoveryErrRes = await GET(recoveryErrReq);
    expect(recoveryErrRes.status).toBe(307);
    expect(recoveryErrRes.headers.get('location')).toBe(
      'https://pedagogy-master.vercel.app/reset-password?error=Link%20expired'
    );
  });
});
