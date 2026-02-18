import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase';
import { DEFAULT_MASTER_PROMPT, LATEST_SQL_BLUEPRINT } from '../../../../constants';

export const dynamic = 'force-dynamic';

/**
 * NEURAL BRAIN RETRIEVAL (v11.0)
 * Logic: Fetches the stored system IP. 
 * If database blueprint is empty, fallbacks to the LATEST_SQL_BLUEPRINT from constants.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseServerClient(token);
    
    const { data: brain, error } = await supabase
      .from('neural_brain')
      .select('id, master_prompt, blueprint_sql, version, is_active, updated_at')
      .eq('id', 'system-brain')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;

    return NextResponse.json({
      success: true,
      brain: {
        id: brain?.id || 'system-brain',
        master_prompt: brain?.master_prompt || DEFAULT_MASTER_PROMPT,
        // UI Logic: If DB has no SQL, serve the system constant
        blueprint_sql: brain?.blueprint_sql || LATEST_SQL_BLUEPRINT,
        version: brain?.version || 0,
        is_active: brain?.is_active ?? true,
        updated_at: brain?.updated_at
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}