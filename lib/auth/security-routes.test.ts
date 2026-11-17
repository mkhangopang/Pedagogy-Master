import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockResetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
const mockVerifyOtp = vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Invalid' } });
const mockResend = vi.fn().mockResolvedValue({ error: null });
const mockGetUser = vi.fn();
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockOwnerMaybeSingle = vi.fn();
const mockAdminProfileMaybeSingle = vi.fn();
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

vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
      verifyOtp: mockVerifyOtp,
      resend: mockResend,
    },
  })),
}));

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: vi.fn(() => true),
  getCredentials: vi.fn(() => ({ url: 'https://example.supabase.co', key: 'anon-key-placeholder-123456' })),
  supabase: {
    auth: {
      getUser: mockGetUser,
    },
  },
  getSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: vi.fn((table: string) => {
      if (table === 'documents') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: mockOwnerMaybeSingle,
            })),
          })),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: mockAdminProfileMaybeSingle,
            })),
          })),
        };
      }
      return { select: vi.fn() };
    }),
  })),
  getSupabaseAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        generateLink: vi.fn(),
        updateUserById: vi.fn(),
      },
    },
    from: vi.fn((table: string) => {
      if (table === 'slo_feedback') {
        return { insert: mockInsert };
      }
      if (table === 'documents') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: mockOwnerMaybeSingle,
            })),
          })),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: mockAdminProfileMaybeSingle,
            })),
          })),
        };
      }
      return { select: vi.fn() };
    }),
  })),
}));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: vi.fn(() => true),
  getCredentials: vi.fn(() => ({ url: 'https://example.supabase.co', key: 'anon-key-placeholder-123456' })),
  supabase: {
    auth: {
      getUser: mockGetUser,
    },
  },
  getSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
  getSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  })),
}));

describe('Security Hardening: Auth Reset, SLO Feedback & Docs Process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kvCounts.clear();
  });

  it('POST /api/auth/reset-password never leaks OTPs or recovery links and sanitizes untrusted origin', async () => {
    const { POST } = await import('../../app/api/auth/reset-password/route');

    const req = new NextRequest('https://pedagogy-master.vercel.app/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({
        action: 'request',
        email: 'teacher@school.edu.pk',
        origin: 'https://evil-phish.example.com',
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.emailOtp).toBeUndefined();
    expect(json.hashedToken).toBeUndefined();
    expect(json.actionLink).toBeUndefined();
    expect(json.directLocalUrl).toBeUndefined();
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('teacher@school.edu.pk', {
      redirectTo: 'https://pedagogy-master.vercel.app/reset-password',
    });
  });

  it('POST /api/slo/feedback rejects unauthenticated callers (401) and user_id spoofing (403)', async () => {
    const { POST } = await import('../../app/api/slo/feedback/route');

    const unauthReq = new NextRequest('https://pedagogy-master.vercel.app/api/slo/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 'victim-uuid',
        original_text: 'Old SLO',
        corrected_json: { slo_code: 'B-09-A-01' },
      }),
    });
    const unauthRes = await POST(unauthReq);
    expect(unauthRes.status).toBe(401);

    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
    const spoofReq = new NextRequest('https://pedagogy-master.vercel.app/api/slo/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-jwt-token',
      },
      body: JSON.stringify({
        user_id: 'different-user-999',
        original_text: 'Old SLO',
        corrected_json: { slo_code: 'B-09-A-01' },
      }),
    });
    const spoofRes = await POST(spoofReq);
    expect(spoofRes.status).toBe(403);
    expect(mockInsert).not.toHaveBeenCalled();

    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
    const validReq = new NextRequest('https://pedagogy-master.vercel.app/api/slo/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-jwt-token',
      },
      body: JSON.stringify({
        original_text: 'Old SLO',
        corrected_json: { slo_code: 'B-09-A-01' },
      }),
    });
    const validRes = await POST(validReq);
    expect(validRes.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-123', original_text: 'Old SLO' })
    );
  });

  it('POST /api/docs/process/[documentId] rejects malformed IDs (400), unauth callers (401), and non-owners (403)', async () => {
    const { POST } = await import('../../app/api/docs/process/[documentId]/route');

    const badIdReq = new NextRequest('https://pedagogy-master.vercel.app/api/docs/process/not-a-uuid', {
      method: 'POST',
    });
    const badIdRes = await POST(badIdReq, { params: Promise.resolve({ documentId: 'not-a-uuid' }) });
    expect(badIdRes).toBeDefined();
    expect(badIdRes!.status).toBe(400);

    const validDocId = '11111111-1111-4111-8111-111111111111';
    const unauthReq = new NextRequest(`https://pedagogy-master.vercel.app/api/docs/process/${validDocId}`, {
      method: 'POST',
    });
    const unauthRes = await POST(unauthReq, { params: Promise.resolve({ documentId: validDocId }) });
    expect(unauthRes).toBeDefined();
    expect(unauthRes!.status).toBe(401);

    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'attacker-user' } }, error: null });
    mockOwnerMaybeSingle.mockResolvedValueOnce({
      data: { id: validDocId, user_id: 'owner-user' },
      error: null,
    });
    mockAdminProfileMaybeSingle.mockResolvedValueOnce({
      data: { role: 'teacher', email: 'attacker@example.com' },
      error: null,
    });

    const forbiddenReq = new NextRequest(`https://pedagogy-master.vercel.app/api/docs/process/${validDocId}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer attacker-jwt-token' },
    });
    const forbiddenRes = await POST(forbiddenReq, { params: Promise.resolve({ documentId: validDocId }) });
    expect(forbiddenRes).toBeDefined();
    expect(forbiddenRes!.status).toBe(403);
  });
});
