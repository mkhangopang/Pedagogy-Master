import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_KINDS = new Set([
  'micro_feedback',
  'pilot_feedback',
  'analytics_event',
  'plan_interest',
]);

function cleanString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token || token === 'undefined' || token.length < 10) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = getSupabaseServerClient(token);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const kind = cleanString(body.kind, 40);
    if (!VALID_KINDS.has(kind)) {
      return NextResponse.json({ error: 'Unsupported feedback kind' }, { status: 400 });
    }

    let signalType = 'analytics:event';
    let toolType = cleanString(body.toolType || body.tool || 'workspace', 64) || 'workspace';
    let signalData: Record<string, any> = {};

    if (kind === 'micro_feedback') {
      const rating = body.rating === 'up' || body.rating === 'down' ? body.rating : null;
      if (!rating) {
        return NextResponse.json({ error: 'Valid rating ("up" or "down") required' }, { status: 400 });
      }
      const tags = Array.isArray(body.tags)
        ? body.tags
            .filter((t: unknown) => typeof t === 'string')
            .map((t: string) => t.trim().slice(0, 48))
            .filter(Boolean)
            .slice(0, 5)
        : [];
      const comment = cleanString(body.comment, 500);
      const language = cleanString(body.language, 12) || 'en';
      const targetType = cleanString(body.targetType, 40) || 'artifact';
      const preview = cleanString(body.preview, 160);

      signalType = 'feedback:micro';
      signalData = {
        rating,
        tags,
        comment: comment || undefined,
        language,
        targetType,
        preview: preview || undefined,
      };
    } else if (kind === 'pilot_feedback') {
      const category = cleanString(body.category, 48) || 'General Feedback';
      const message = cleanString(body.message, 1000);
      const ratingNum =
        typeof body.rating === 'number' && body.rating >= 1 && body.rating <= 5
          ? Math.round(body.rating)
          : null;
      const view = cleanString(body.view, 48) || 'workspace';

      if (!message && !ratingNum) {
        return NextResponse.json({ error: 'Please provide feedback text or a rating' }, { status: 400 });
      }

      signalType = 'feedback:pilot';
      toolType = cleanString(body.view, 64) || 'pilot_drawer';
      signalData = {
        category,
        rating: ratingNum,
        message,
        view,
      };
    } else if (kind === 'plan_interest') {
      const plan = cleanString(body.plan, 32);
      if (plan !== 'pro' && plan !== 'enterprise') {
        return NextResponse.json({ error: 'Invalid target plan' }, { status: 400 });
      }
      const approxPriceUsd = cleanString(body.approxPriceUsd, 24);
      const note = cleanString(body.note, 300);

      signalType = 'feedback:plan_interest';
      toolType = 'pricing';
      signalData = {
        plan,
        approxPriceUsd: approxPriceUsd || (plan === 'pro' ? '~$9/mo' : '~$29/mo'),
        note: note || undefined,
      };
    } else {
      const action = cleanString(body.action, 64);
      const category = cleanString(body.category, 64) || 'engagement';
      const label = cleanString(body.label, 120);
      const value = typeof body.value === 'number' && Number.isFinite(body.value) ? body.value : undefined;
      const metadata =
        body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
          ? Object.fromEntries(
              Object.entries(body.metadata)
                .slice(0, 12)
                .map(([k, v]) => [
                  String(k).slice(0, 40),
                  typeof v === 'string' ? v.slice(0, 120) : typeof v === 'number' || typeof v === 'boolean' ? v : null,
                ])
            )
          : undefined;

      if (!action) {
        return NextResponse.json({ error: 'Event action required' }, { status: 400 });
      }

      signalType = 'analytics:event';
      signalData = {
        action,
        category,
        label: label || undefined,
        value,
        metadata,
      };
    }

    const { error: insertError } = await supabase.from('improvement_signals').insert({
      user_id: user.id,
      signal_type: signalType,
      signal_data: signalData,
      tool_type: toolType,
      compiled: false,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      return NextResponse.json({ error: 'Unable to record feedback right now' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Feedback API] Unexpected fault:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
