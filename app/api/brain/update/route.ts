import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';

/**
 * NEURAL BRAIN UPDATE GATEWAY (v10.5)
 * Logic: Atomic upsert of the system's foundational pedagogical logic.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized: Gateway closed.' }, { status: 401 });

    const { master_prompt, blueprint_sql } = await req.json();
    const supabase = getSupabaseServerClient(token);

    // Verify identity has app_admin rights (Admin check is performed inside Supabase via RLS or explicit check)
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Session Invalid.' }, { status: 401 });

    // Fetch current version to increment
    const { data: currentBrain } = await supabase
      .from('neural_brain')
      .select('version')
      .eq('id', 'system-brain')
      .maybeSingle();

    const nextVersion = (currentBrain?.version || 0) + 1;

    // Upsert the master prompt and blueprint into the brain table
    const { data, error } = await supabase
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
    return NextResponse.json({ error: error.message || "Synthesis grid exception during persistence." }, { status: 500 });
  }
}