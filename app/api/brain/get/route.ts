import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { DEFAULT_MASTER_PROMPT, LATEST_SQL_BLUEPRINT } from '../../../../constants';

export const dynamic = 'force-dynamic';

/**
 * NEURAL BRAIN RETRIEVAL (v11.3 - RESILIENT)
 * Logic: Fetches system IP. Fallbacks to default constants if columns are missing or types mismatch.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userClient = getSupabaseServerClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const adminSupabase = getSupabaseAdminClient();
    
    // TIER 1: Full attempt
    let { data: brain, error } = await adminSupabase
      .from('neural_brain')
      .select('id, master_prompt, blueprint_sql, version, is_active, updated_at')
      .eq('id', 'system-brain')
      .maybeSingle();

    // TIER 2: Fallback for Schema Desync (Missing columns or UUID mismatch)
    if (error && (
      error.message.includes('blueprint_sql') || 
      error.message.includes('uuid') || 
      error.code === 'PGRST204' ||
      error.code === '22P02'
    )) {
      console.warn("⚠️ Database schema conflict detected. Serving default config for recovery.");
      return NextResponse.json({
        success: true,
        brain: {
          id: 'system-brain',
          master_prompt: DEFAULT_MASTER_PROMPT,
          blueprint_sql: LATEST_SQL_BLUEPRINT,
          version: 0,
          is_active: true,
          updated_at: new Date().toISOString()
        }
      });
    }

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