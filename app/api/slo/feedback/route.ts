import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Authentication service not configured' }, { status: 503 });
    }

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userClient = getSupabaseServerClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { original_text, original_json, corrected_json, context_metadata, user_id } = body;

    if (user_id && String(user_id) !== user.id) {
      return NextResponse.json({ error: 'Forbidden: user_id mismatch' }, { status: 403 });
    }

    if (typeof original_text !== 'string' || !original_text.trim() || original_text.length > 20000) {
      return NextResponse.json({ error: 'Invalid original_text' }, { status: 400 });
    }

    if (!corrected_json || typeof corrected_json !== 'object') {
      return NextResponse.json({ error: 'Invalid corrected_json' }, { status: 400 });
    }

    const adminSupabase = getSupabaseAdminClient();
    const { error } = await adminSupabase.from('slo_feedback').insert({
      user_id: user.id,
      original_text: original_text.trim(),
      original_json: original_json ?? null,
      corrected_json,
      context_metadata: context_metadata && typeof context_metadata === 'object' ? context_metadata : null
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Feedback API] Error:', err.message);
    return NextResponse.json({ error: err.message || 'Feedback submission failed' }, { status: 500 });
  }
}
