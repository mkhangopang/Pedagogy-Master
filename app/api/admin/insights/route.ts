import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase';
import { selfImprovementEngine } from '../../../../lib/ai/self-improvement-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseServerClient(token);
  const { data: { user } } = await supabase.auth.getUser(token);

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

  if (!user || !adminEmails.includes((user.email || '').toLowerCase())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const summary = await selfImprovementEngine.getInsightSummary(supabase);
  return NextResponse.json(summary);
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseServerClient(token);
  const { data: { user } } = await supabase.auth.getUser(token);

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

  if (!user || !adminEmails.includes((user.email || '').toLowerCase())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { brainId, action } = await req.json();

  if (action === 'activate' && brainId) {
    await supabase.from('neural_brain').update({ is_active: false }).neq('id', brainId);
    const { error } = await supabase.from('neural_brain')
      .update({ is_active: true, is_candidate: false })
      .eq('id', brainId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'discard' && brainId) {
    await supabase.from('neural_brain').delete().eq('id', brainId).eq('is_active', false);
    return NextResponse.json({ success: true });
  }

  if (action === 'force_compile') {
    await selfImprovementEngine.compileInsights(supabase);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
