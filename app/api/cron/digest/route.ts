import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../lib/supabase';
import { orchestrator } from '../../../../lib/ai/model-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();

  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, email, name, grade_level, subject_area, queries_used')
    .eq('role', 'teacher')
    .gt('queries_used', 0)
    .limit(500);

  if (!teachers || teachers.length === 0) {
    return NextResponse.json({ message: 'No teachers to digest', count: 0 });
  }

  let successCount = 0;
  const errors: string[] = [];

  for (const teacher of teachers) {
    try {
      const digest = await generatePersonalizedDigest(teacher, supabase);
      if (!digest) continue;

      await supabase.from('email_queue').insert({
        to_email: teacher.email,
        to_name: teacher.name,
        subject: `📚 Your Week in Teaching — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
        html_body: digest.html,
        template_id: 'weekly_digest',
        metadata: { teacherId: teacher.id, weekOf: new Date().toISOString() },
        scheduled_at: new Date().toISOString(),
        status: 'pending'
      });

      successCount++;
    } catch (e: any) {
      errors.push(`${teacher.email}: ${e.message}`);
    }
  }

  return NextResponse.json({
    message: `Queued ${successCount} digests`,
    errors: errors.slice(0, 10),
    totalTeachers: teachers.length
  });
}

async function generatePersonalizedDigest(teacher: any, supabase: any) {
  const { data: untaughtSLOs } = await supabase
    .from('slo_database')
    .select('slo_code, slo_full_text')
    .not('id', 'in', supabase.from('teacher_progress').select('slo_code').eq('user_id', teacher.id).in('status', ['teaching', 'completed']))
    .limit(3);

  const { data: stats } = await supabase
    .from('teacher_progress')
    .select('status')
    .eq('user_id', teacher.id);

  const completedCount = (stats || []).filter((s: any) => s.status === 'completed').length;
  const totalSLOs = (stats || []).length;
  const progressPct = totalSLOs > 0 ? Math.round((completedCount / totalSLOs) * 100) : 0;

  const tipPrompt = `Generate a concise, research-backed teaching tip for a ${teacher.grade_level || 'secondary school'} ${teacher.subject_area || 'core subject'} teacher.`;
  const tipResult = await orchestrator.executeTask(tipPrompt, 'lookup');
  const teachingTip = tipResult.text || 'Focus on retrieval practice this week.';

  const sloList = (untaughtSLOs || []).map((s: any) => `• ${s.slo_code}: ${s.slo_full_text}`).join('\n');

  const html = `
    <h1>Weekly Teaching Intelligence</h1>
    <p>Hello, ${teacher.name || 'Teacher'} 👋</p>
    <p>${completedCount} of ${totalSLOs} SLOs completed (${progressPct}%)</p>
    ${untaughtSLOs && untaughtSLOs.length > 0 ? `<h2>Suggested SLOs</h2><p>${sloList}</p>` : ''}
    <h2>💡 Teaching Tip</h2><p>${teachingTip}</p>
  `;

  return { html };
}
