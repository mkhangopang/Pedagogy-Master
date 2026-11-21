import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { getSupabaseAdminClient } from '../../../../lib/supabase';
import { orchestrator } from '../../../../lib/ai/model-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorizedCron(req: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) return false;

  const headerSecret = req.headers.get('x-cron-secret')?.trim();
  const authHeader = req.headers.get('authorization')?.trim();
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const provided = headerSecret || bearerSecret;
  if (!provided) return false;

  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expectedSecret).digest();
  return timingSafeEqual(a, b);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
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
  const { data: stats } = await supabase
    .from('teacher_progress')
    .select('slo_code, status')
    .eq('user_id', teacher.id);

  const taughtCodes = new Set(
    (stats || [])
      .filter((s: any) => s.status === 'teaching' || s.status === 'completed')
      .map((s: any) => String(s.slo_code || '').trim())
      .filter(Boolean)
  );

  const { data: candidateSLOs } = await supabase
    .from('slo_database')
    .select('slo_code, slo_full_text')
    .limit(25);

  const untaughtSLOs = (candidateSLOs || [])
    .filter((s: any) => !taughtCodes.has(String(s.slo_code || '').trim()))
    .slice(0, 3);

  const completedCount = (stats || []).filter((s: any) => s.status === 'completed').length;
  const totalSLOs = (stats || []).length;
  const progressPct = totalSLOs > 0 ? Math.round((completedCount / totalSLOs) * 100) : 0;

  const tipPrompt = `Generate a concise, research-backed teaching tip for a ${teacher.grade_level || 'secondary school'} ${teacher.subject_area || 'core subject'} teacher.`;
  const tipResult = await orchestrator.executeTask(tipPrompt, 'lookup');
  const teachingTip = tipResult.text || 'Focus on retrieval practice this week.';

  const sloList = untaughtSLOs
    .map((s: any) => `• ${escapeHtml(s.slo_code)}: ${escapeHtml(s.slo_full_text)}`)
    .join('<br/>');

  const html = `
    <h1>Weekly Teaching Intelligence</h1>
    <p>Hello, ${escapeHtml(teacher.name || 'Teacher')} 👋</p>
    <p>${completedCount} of ${totalSLOs} SLOs completed (${progressPct}%)</p>
    ${untaughtSLOs.length > 0 ? `<h2>Suggested SLOs</h2><p>${sloList}</p>` : ''}
    <h2>💡 Teaching Tip</h2><p>${escapeHtml(teachingTip)}</p>
  `;

  return { html };
}
