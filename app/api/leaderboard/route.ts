import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { kv } from '../../../lib/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token || token.length < 10) {
      return NextResponse.json({ error: 'Auth Required' }, { status: 401 });
    }

    const supabase = getSupabaseServerClient(token);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const { data: myProfile } = await supabase
      .from('profiles')
      .select('workspace_id, name')
      .eq('id', user.id)
      .single();

    if (!myProfile?.workspace_id) {
      return NextResponse.json({ leaderboard: [], message: 'No workspace assigned' });
    }

    const cacheKey = `leaderboard:${myProfile.workspace_id}`;
    const cached = await kv.get<any>(cacheKey);
    if (cached) return NextResponse.json({ leaderboard: cached, fromCache: true });

    const { data: members } = await supabase
      .from('profiles')
      .select(`
        id,
        name,
        show_on_leaderboard,
        generation_count,
        success_rate,
        subject_area,
        grade_level
      `)
      .eq('workspace_id', myProfile.workspace_id)
      .eq('role', 'teacher')
      .order('generation_count', { ascending: false })
      .limit(20);

    if (!members) return NextResponse.json({ leaderboard: [] });

    const memberIds = members.map(m => m.id);
    const { data: progressCounts } = await supabase
      .from('teacher_progress')
      .select('user_id')
      .in('user_id', memberIds)
      .eq('status', 'completed');

    const sloCountByUser = (progressCounts || []).reduce((acc: Record<string, number>, r: any) => {
      acc[r.user_id] = (acc[r.user_id] || 0) + 1;
      return acc;
    }, {});

    const leaderboard = members.map((m, index) => ({
      rank: index + 1,
      name: m.show_on_leaderboard ? m.name : `Anonymous Teacher`,
      isCurrentUser: m.id === user.id,
      generationCount: m.generation_count || 0,
      successRate: Math.round((m.success_rate || 0) * 100),
      slosCovered: sloCountByUser[m.id] || 0,
      subjectArea: m.subject_area || 'General',
      gradeLevel: m.grade_level || 'Multi-Grade',
      badge: getBadge(m.generation_count || 0, (m.success_rate || 0))
    }));

    await kv.set(cacheKey, leaderboard, 300);

    return NextResponse.json({ leaderboard });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function getBadge(generationCount: number, successRate: number): string {
  if (generationCount >= 200 && successRate >= 0.9) return '🏆 Master Educator';
  if (generationCount >= 100 && successRate >= 0.8) return '⭐ Curriculum Champion';
  if (generationCount >= 50) return '🎯 Active Contributor';
  if (generationCount >= 20) return '📚 Growing Practitioner';
  if (generationCount >= 5) return '🌱 Getting Started';
  return '👋 New Member';
}
