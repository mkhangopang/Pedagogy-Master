import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';

/**
 * NEURAL BRAIN UPDATE GATEWAY (v11.0)
 * Logic: Atomic upsert using Admin Client with strict role verification.
 * This fixes "Persistence Refused" errors caused by RLS restrictions on system tables.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized: Gateway closed.' }, { status: 401 });

    const { master_prompt, blueprint_sql } = await req.json();
    
    // 1. Verify User Session
    const userClient = getSupabaseServerClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Session Invalid.' }, { status: 401 });

    // 2. Verify Admin Role
    const adminSupabase = getSupabaseAdminClient();
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'app_admin') {
      return NextResponse.json({ error: 'Access Denied: Founder privileges required for grid commitment.' }, { status: 403 });
    }

    // 3. Perform Update via Admin Client
    const { data: currentBrain } = await adminSupabase
      .from('neural_brain')
      .select('version')
      .eq('id', 'system-brain')
      .maybeSingle();

    const nextVersion = (currentBrain?.version || 0) + 1;

    const { data, error } = await adminSupabase
      .from('neural_brain')
      .upsert({
        id: 'system-brain',
        master_prompt: master_prompt || "",
        blueprint_sql: blueprint_sql || "",
        is_active: true,
        updated_at: new Date().toISOString(),
        version: nextVersion
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Neural Brain re-aligned and persisted to vault.",
      brain: data
    });
  } catch (error: any) {
    console.error("❌ [Brain Update Fault]:", error);
    return NextResponse.json({ 
      error: error.message || "Synthesis grid exception during persistence." 
    }, { status: 500 });
  }
}