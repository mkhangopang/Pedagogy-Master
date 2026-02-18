import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseServerClient(token);
    
    // Fetch the single system-brain record
    const { data: brain, error } = await supabase
      .from('neural_brain')
      .select('id, master_prompt, blueprint_sql, version, is_active, updated_at')
      .eq('id', 'system-brain')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;

    return NextResponse.json({
      success: true,
      brain: brain || {
        id: 'system-brain',
        master_prompt: "",
        blueprint_sql: "",
        version: 0
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}