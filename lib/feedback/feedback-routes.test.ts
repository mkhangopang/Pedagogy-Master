import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetUser = vi.fn();
const mockSignalInsert = vi.fn().mockResolvedValue({ error: null });
const mockProfileMaybeSingle = vi.fn();
const mockAdminProfilesSelect = vi.fn();
const mockAdminSignalsLimit = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: vi.fn((table: string) => {
      if (table === 'improvement_signals') {
        return { insert: mockSignalInsert };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: mockProfileMaybeSingle,
            })),
          })),
        };
      }
      return { select: vi.fn() };
    }),
  })),
  getSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: mockAdminProfilesSelect,
        };
      }
      if (table === 'improvement_signals') {
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: mockAdminSignalsLimit,
              })),
            })),
          })),
        };
      }
      return { select: vi.fn() };
    }),
  })),
}));

import { POST as feedbackPost } from '../../app/api/feedback/route';
import { GET as analyticsGet } from '../../app/api/admin/analytics/route';

describe('Feedback & Admin Analytics Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  it('rejects unauthenticated requests to POST /api/feedback with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ kind: 'micro_feedback', rating: 'up' }),
    });
    const res = await feedbackPost(req);
    expect(res.status).toBe(401);
  });

  it('validates and persists micro_feedback for authenticated educators', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-123', email: 'teacher@school.edu' } },
      error: null,
    });

    const req = new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt-token-123456' },
      body: JSON.stringify({
        kind: 'micro_feedback',
        rating: 'up',
        tags: ['SLO Alignment'],
        language: 'sd',
        toolType: 'master_plan',
      }),
    });

    const res = await feedbackPost(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockSignalInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        signal_type: 'feedback:micro',
        tool_type: 'master_plan',
      })
    );
  });

  it('rejects non-admin access to GET /api/admin/analytics with 403', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'teacher-1', email: 'teacher@school.edu' } },
      error: null,
    });
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: { role: 'teacher', email: 'teacher@school.edu' },
    });

    const req = new NextRequest('http://localhost:3000/api/admin/analytics', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-jwt-token-123456' },
    });

    const res = await analyticsGet(req);
    expect(res.status).toBe(403);
  });

  it('aggregates usage, translations, satisfaction, and waitlist metrics for admin', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'admin-1', email: 'mkgopang@gmail.com' } },
      error: null,
    });
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: { role: 'app_admin', email: 'mkgopang@gmail.com' },
    });
    mockAdminProfilesSelect.mockResolvedValueOnce({
      data: [
        { id: 'u1', plan: 'free', role: 'teacher', created_at: new Date().toISOString() },
        { id: 'u2', plan: 'free', role: 'teacher', created_at: new Date().toISOString() },
      ],
    });
    mockAdminSignalsLimit.mockResolvedValueOnce({
      data: [
        { id: 's1', user_id: 'u1', signal_type: 'ai_quota_usage', signal_data: {}, tool_type: 'master_plan', created_at: new Date().toISOString() },
        { id: 's2', user_id: 'u1', signal_type: 'translation_usage', signal_data: { targetLanguage: 'sd' }, tool_type: 'translate_sd', created_at: new Date().toISOString() },
        { id: 's3', user_id: 'u2', signal_type: 'feedback:micro', signal_data: { rating: 'up', tags: ['SLO Alignment'], language: 'en' }, tool_type: 'master_plan', created_at: new Date().toISOString() },
        { id: 's4', user_id: 'u2', signal_type: 'feedback:plan_interest', signal_data: { plan: 'pro' }, tool_type: 'pricing', created_at: new Date().toISOString() },
      ],
    });

    const req = new NextRequest('http://localhost:3000/api/admin/analytics', {
      method: 'GET',
      headers: { Authorization: 'Bearer admin-jwt-token-123456' },
    });

    const res = await analyticsGet(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.users.total).toBe(2);
    expect(data.usage.syntheses30d).toBe(1);
    expect(data.usage.translations.sindhi).toBe(1);
    expect(data.feedback.micro.satisfactionRate).toBe(100);
    expect(data.waitlist.proInterested).toBe(1);
  });
});
