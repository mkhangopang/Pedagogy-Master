import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { DEFAULT_MASTER_PROMPT, LATEST_SQL_BLUEPRINT } from '../../../../constants';

export const dynamic = 'force-dynamic';

/**
 * NEURAL BRAIN RETRIEVAL (v11.1)
 * Logic: Fetches the stored system IP using Admin Client to bypass RLS.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // We verify the token is valid first
    const userClient = getSupabaseServerClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const adminSupabase = getSupabaseAdminClient();
    
    const { data: brain, error } = await adminSupabase
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