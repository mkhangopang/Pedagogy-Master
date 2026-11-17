import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { isAdminUser } from '../../../../lib/auth/user-role';
import { UserProfile } from '../../../../types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function checkAdmin(supabase: any, user: any): Promise<boolean> {
  if (!user) return false;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .maybeSingle();

  return isAdminUser({
    email: profile?.email || user.email || '',
    role: profile?.role || 'teacher',
  } as UserProfile);
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token || token === 'undefined' || token.length < 10) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userSupabase = getSupabaseServerClient(token);
    const {
      data: { user },
      error: authErr,
    } = await userSupabase.auth.getUser(token);

    if (authErr || !user) {
      return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });
    }

    if (!(await checkAdmin(userSupabase, user))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
    const db = hasServiceRole ? getSupabaseAdminClient() : userSupabase;

    const now = new Date();
    const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 86400_000).toISOString();
    const sevenDaysAgoMs = now.getTime() - 7 * 86400_000;
    const oneDayAgoMs = now.getTime() - 86400_000;

    const [{ data: profiles }, { data: signals }] = await Promise.all([
      db.from('profiles').select('id, plan, role, created_at'),
      db
        .from('improvement_signals')
        .select('id, user_id, signal_type, signal_data, tool_type, created_at')
        .gte('created_at', thirtyDaysAgoIso)
        .order('created_at', { ascending: false })
        .limit(2000),
    ]);

    const profileList = Array.isArray(profiles) ? profiles : [];
    const signalList = Array.isArray(signals) ? signals : [];

    const activeUserIds7d = new Set<string>();
    const activeUserIds24h = new Set<string>();

    let syntheses24h = 0;
    let syntheses30d = 0;
    let urduTranslations = 0;
    let sindhiTranslations = 0;

    const toolCounts: Record<string, number> = {};
    const viewCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};

    let microUp = 0;
    let microDown = 0;
    const recentMicroFeedback: any[] = [];
    const recentPilotFeedback: any[] = [];

    const planInterestProUsers = new Set<string>();
    const planInterestEntUsers = new Set<string>();

    const dailyMap: Record<string, { date: string; syntheses: number; events: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400_000).toISOString().slice(0, 10);
      dailyMap[d] = { date: d, syntheses: 0, events: 0 };
    }

    for (const s of signalList) {
      const createdMs = Date.parse(s.created_at || '');
      const dayKey = (s.created_at || '').slice(0, 10);

      if (s.user_id) {
        if (createdMs >= sevenDaysAgoMs) activeUserIds7d.add(s.user_id);
        if (createdMs >= oneDayAgoMs) activeUserIds24h.add(s.user_id);
      }

      if (dailyMap[dayKey]) {
        dailyMap[dayKey].events++;
      }

      if (s.signal_type === 'ai_quota_usage') {
        syntheses30d++;
        if (createdMs >= oneDayAgoMs) syntheses24h++;
        if (dailyMap[dayKey]) dailyMap[dayKey].syntheses++;
        const tName = String(s.tool_type || 'synthesis');
        toolCounts[tName] = (toolCounts[tName] || 0) + 1;
      } else if (s.signal_type === 'translation_usage') {
        const lang = s.signal_data?.targetLanguage;
        if (lang === 'ur') urduTranslations++;
        if (lang === 'sd') sindhiTranslations++;
      } else if (s.signal_type === 'feedback:micro') {
        const rating = s.signal_data?.rating;
        if (rating === 'up') microUp++;
        if (rating === 'down') microDown++;
        const tags = Array.isArray(s.signal_data?.tags) ? s.signal_data.tags : [];
        for (const tag of tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
        if (recentMicroFeedback.length < 15) {
          recentMicroFeedback.push({
            id: s.id,
            rating,
            tags,
            comment: s.signal_data?.comment || '',
            language: s.signal_data?.language || 'en',
            toolType: s.tool_type || 'artifact',
            createdAt: s.created_at,
          });
        }
      } else if (s.signal_type === 'feedback:pilot') {
        if (recentPilotFeedback.length < 20) {
          recentPilotFeedback.push({
            id: s.id,
            category: s.signal_data?.category || 'General',
            rating: s.signal_data?.rating ?? null,
            message: s.signal_data?.message || '',
            view: s.signal_data?.view || 'workspace',
            createdAt: s.created_at,
          });
        }
      } else if (s.signal_type === 'feedback:plan_interest') {
        const targetPlan = s.signal_data?.plan;
        if (targetPlan === 'pro' && s.user_id) planInterestProUsers.add(s.user_id);
        if (targetPlan === 'enterprise' && s.user_id) planInterestEntUsers.add(s.user_id);
      } else if (s.signal_type === 'analytics:event') {
        const action = s.signal_data?.action;
        if (action === 'view_opened' && s.signal_data?.label) {
          const vName = String(s.signal_data.label);
          viewCounts[vName] = (viewCounts[vName] || 0) + 1;
        }
      }
    }

    const microTotal = microUp + microDown;
    const satisfactionRate = microTotal > 0 ? Math.round((microUp / microTotal) * 100) : null;

    return NextResponse.json({
      users: {
        total: profileList.length,
        free: profileList.filter((p: any) => !p.plan || p.plan === 'free').length,
        active24h: activeUserIds24h.size,
        active7d: activeUserIds7d.size,
        new7d: profileList.filter((p: any) => Date.parse(p.created_at || '') >= sevenDaysAgoMs).length,
      },
      usage: {
        syntheses24h,
        syntheses30d,
        translations: {
          total: urduTranslations + sindhiTranslations,
          urdu: urduTranslations,
          sindhi: sindhiTranslations,
        },
        topTools: Object.entries(toolCounts)
          .map(([tool, count]) => ({ tool, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
        topViews: Object.entries(viewCounts)
          .map(([view, count]) => ({ view, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
        dailyActivity: Object.values(dailyMap),
      },
      feedback: {
        micro: {
          total: microTotal,
          helpful: microUp,
          needsWork: microDown,
          satisfactionRate,
          topTags: Object.entries(tagCounts)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6),
          recent: recentMicroFeedback,
        },
        pilot: recentPilotFeedback,
      },
      waitlist: {
        proInterested: planInterestProUsers.size,
        enterpriseInterested: planInterestEntUsers.size,
      },
    });
  } catch (err: any) {
    console.error('[Admin Analytics] Unexpected error:', err);
    return NextResponse.json({ error: 'Failed to aggregate analytics' }, { status: 500 });
  }
}
