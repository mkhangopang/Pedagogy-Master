/**
 * AI STATUS — Synthesizer Grid Health Dashboard
 *
 * Returns the health and performance state of ALL registered AI providers.
 * Used by the admin dashboard to show which models are active, saturated, or disabled.
 *
 * GET /api/ai-status
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSynthesizer } from '../../../lib/ai/synthesizer-core';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { checkAdmin } from '../../../lib/auth/user-role';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifyAdminRequest(req: NextRequest): Promise<NextResponse | null> {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServerClient(token);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const isAdmin = await checkAdmin(supabase, user.id);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const authError = await verifyAdminRequest(req);
    if (authError) return authError;

    const health = getSynthesizer().getProviderStatus();

    const summary = {
      total: health.length,
      active: health.filter(p => p.status === 'active').length,
      saturated: health.filter(p => p.status === 'saturated').length,
      disabled: health.filter(p => p.status === 'disabled').length,
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      providers: health,
    });
  } catch (error: any) {
    console.error('[AI Status GET] Internal error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load provider status' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authError = await verifyAdminRequest(req);
    if (authError) return authError;

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'reset') {
      getSynthesizer().realignGrid();
      return NextResponse.json({ success: true, message: 'Reset all providers' });
    }

    return NextResponse.json({ error: 'Unknown action. Use: reset' }, { status: 400 });
  } catch (error: any) {
    console.error('[AI Status POST] Internal error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update provider status' }, { status: 500 });
  }
}