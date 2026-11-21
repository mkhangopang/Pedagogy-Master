import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';

const mockGetUser = vi.fn();
const mockCheckAdmin = vi.fn();
const mockAdminFrom = vi.fn();
const mockServerFrom = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabaseServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockServerFrom,
  })),
  getSupabaseAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
  getCredentials: vi.fn(() => ({ url: 'https://example.supabase.co', key: 'anon-key' })),
  isSupabaseConfigured: vi.fn(() => false),
}));

vi.mock('../../lib/auth/user-role', () => ({
  checkAdmin: (...args: any[]) => mockCheckAdmin(...args),
  isAdminUser: vi.fn((p: any) => p?.role === 'app_admin'),
}));

vi.mock('../../lib/kv', () => ({
  kv: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
  },
}));

vi.mock('../../lib/ai/model-orchestrator', () => ({
  orchestrator: {
    executeTask: vi.fn(async () => ({ text: 'Use <b>retrieval</b> practice & warmups.' })),
  },
}));

describe('Critical security and reliability regression suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects unauthenticated and non-admin requests on /api/ai-status', async () => {
    const { GET, POST } = await import('../../app/api/ai-status/route');

    const unauthGet = await GET(new NextRequest('http://localhost:3000/api/ai-status'));
    expect(unauthGet.status).toBe(401);

    mockGetUser.mockResolvedValue({ data: { user: { id: 'teacher-1' } }, error: null });
    mockCheckAdmin.mockResolvedValue(false);

    const teacherPost = await POST(
      new NextRequest('http://localhost:3000/api/ai-status', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-teacher-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
    );
    expect(teacherPost.status).toBe(403);
  });

  it('forbids non-admin users from reading /api/brain/get', async () => {
    const { GET } = await import('../../app/api/brain/get/route');

    mockGetUser.mockResolvedValue({ data: { user: { id: 'teacher-1' } }, error: null });
    mockCheckAdmin.mockResolvedValue(false);

    const res = await GET(
      new NextRequest('http://localhost:3000/api/brain/get', {
        headers: { Authorization: 'Bearer teacher-jwt' },
      })
    );
    expect(res.status).toBe(403);
  });

  it('prevents empty variant_id from escalating plan when LS_VARIANT env vars are unset', async () => {
    delete process.env.LS_VARIANT_PRO;
    delete process.env.LS_VARIANT_ENTERPRISE;
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = 'test-webhook-secret';

    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'webhook_events') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          insert: async () => ({ error: null }),
        };
      }
      if (table === 'profiles') {
        return { update: updateSpy };
      }
      return {};
    });

    const payload = JSON.stringify({
      meta: { event_id: 'evt_123', event_name: 'subscription_created' },
      data: { id: 'sub_1', attributes: { user_email: 'user@example.com', variant_id: '' } },
    });
    const sig = createHmac('sha256', 'test-webhook-secret').update(payload).digest('hex');

    const { POST } = await import('../../app/api/webhooks/lemon-squeezy/route');
    const res = await POST(
      new NextRequest('http://localhost:3000/api/webhooks/lemon-squeezy', {
        method: 'POST',
        headers: { 'X-Signature': sig },
        body: payload,
      })
    );

    expect(res.status).toBe(200);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('fails closed on /api/cron/digest when CRON_SECRET is unset and HTML-escapes digest content', async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import('../../app/api/cron/digest/route');

    const noSecretRes = await POST(new NextRequest('http://localhost:3000/api/cron/digest', { method: 'POST' }));
    expect(noSecretRes.status).toBe(401);

    process.env.CRON_SECRET = 'super-cron-secret';
    const insertedRows: any[] = [];
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              gt: () => ({
                limit: async () => ({
                  data: [{ id: 't1', email: 't@school.edu', name: '<script>x</script>', queries_used: 3 }],
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'teacher_progress') {
        return {
          select: () => ({
            eq: async () => ({ data: [{ slo_code: 'S1', status: 'completed' }] }),
          }),
        };
      }
      if (table === 'slo_database') {
        return {
          select: () => ({
            limit: async () => ({
              data: [
                { slo_code: 'S1', slo_full_text: 'Already taught' },
                { slo_code: 'S2', slo_full_text: '<img src=x onerror=alert(1)>' },
              ],
            }),
          }),
        };
      }
      if (table === 'email_queue') {
        return {
          insert: async (row: any) => {
            insertedRows.push(row);
            return { error: null };
          },
        };
      }
      return {};
    });

    const okRes = await POST(
      new NextRequest('http://localhost:3000/api/cron/digest', {
        method: 'POST',
        headers: { 'x-cron-secret': 'super-cron-secret' },
      })
    );
    expect(okRes.status).toBe(200);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].html_body).not.toContain('<script>');
    expect(insertedRows[0].html_body).not.toContain('<img src=x');
    expect(insertedRows[0].html_body).toContain('S2:');
    expect(insertedRows[0].html_body).not.toContain('S1:');
  });

  it('clamps negative or NaN ?page= values on /api/explore', async () => {
    const rangeSpy = vi.fn().mockResolvedValue({ data: [], count: 0, error: null });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'slo_database') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                range: rangeSpy,
              }),
            }),
          }),
        };
      }
      if (table === 'documents') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: [] }),
            }),
          }),
        };
      }
      return {};
    });

    const { GET } = await import('../../app/api/explore/route');
    const res = await GET(new NextRequest('http://localhost:3000/api/explore?page=-5'));
    expect(res.status).toBe(200);
    expect(rangeSpy).toHaveBeenCalledWith(0, 19);
    const body = await res.json();
    expect(body.pagination.page).toBe(1);
  });

  it('enforces UUID validation, ownership check, and omits extracted_text by default on /api/docs/status/[documentId]', async () => {
    const { GET } = await import('../../app/api/docs/status/[documentId]/route');

    const badIdRes = await GET(
      new NextRequest('http://localhost:3000/api/docs/status/not-a-uuid', {
        headers: { Authorization: 'Bearer token' },
      }),
      { params: Promise.resolve({ documentId: 'not-a-uuid' }) }
    );
    expect(badIdRes.status).toBe(400);

    const docId = '11111111-1111-4111-8111-111111111111';
    mockGetUser.mockResolvedValue({ data: { user: { id: 'viewer-2' } }, error: null });
    mockCheckAdmin.mockResolvedValue(false);
    mockServerFrom.mockImplementation((table: string) => {
      if (table === 'documents') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: docId,
                  user_id: 'owner-1',
                  is_public: false,
                  status: 'ready',
                  name: 'Bio.pdf',
                  extracted_text: 'SECRET_INTERNAL_TEXT',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'ingestion_jobs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'slo_database') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [] }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const forbiddenRes = await GET(
      new NextRequest(`http://localhost:3000/api/docs/status/${docId}`, {
        headers: { Authorization: 'Bearer token' },
      }),
      { params: Promise.resolve({ documentId: docId }) }
    );
    expect(forbiddenRes.status).toBe(403);

    mockGetUser.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
    const ownerPollRes = await GET(
      new NextRequest(`http://localhost:3000/api/docs/status/${docId}`, {
        headers: { Authorization: 'Bearer token' },
      }),
      { params: Promise.resolve({ documentId: docId }) }
    );
    expect(ownerPollRes.status).toBe(200);
    const ownerPollJson = await ownerPollRes.json();
    expect(ownerPollJson.extracted_text).toBeUndefined();
  });

  it('strips protocol-relative external next redirects in /auth/callback', async () => {
    const { GET } = await import('../../app/auth/callback/route');
    const res = await GET(
      new NextRequest('https://pedagogy-master.vercel.app/auth/callback?next=//evil.example.com/phish')
    );
    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location.startsWith('https://pedagogy-master.vercel.app/')).toBe(true);
    expect(location).not.toContain('evil.example.com');
  });

  it('escapes raw HTML tags and javascript: links in renderSTEM', async () => {
    const { renderSTEM } = await import('../../lib/math-renderer');
    const out = renderSTEM('<img src=x onerror=alert(1)> <script>alert(1)</script> [click](javascript:alert(1)) **Bold**');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('<strong>Bold</strong>');
  });
});
