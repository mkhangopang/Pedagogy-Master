import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { master_prompt } = await req.json();
    const supabase = getSupabaseServerClient(token);

    // Upsert the master prompt into the brain table
    const { data, error } = await supabase
      .from('neural_brain')
      .upsert({
        id: 'system-brain',
        master_prompt: master_prompt,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Neural Brain re-aligned and persisted.",
      brain: data
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
