import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const adminSupabase = getSupabaseAdminClient();
    const { original_text, original_json, corrected_json, context_metadata, user_id } = await req.json();

    if (!original_text || !corrected_json || !user_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { error } = await adminSupabase.from('slo_feedback').insert({
      user_id,
      original_text,
      original_json,
      corrected_json,
      context_metadata
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Feedback API] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
