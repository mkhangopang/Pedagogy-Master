import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';

/**
 * NEURAL BRAIN UPDATE GATEWAY (v11.1 - RESILIENT)
 * Logic: Atomic upsert with automatic schema-fallback.
 * If the DB is missing the 'blueprint_sql' column, it will still save the prompt.
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

    // 3. Fetch Version
    const { data: currentBrain } = await adminSupabase
      .from('neural_brain')
      .select('version')
      .eq('id', 'system-brain')
      .maybeSingle();

    const nextVersion = (currentBrain?.version || 0) + 1;

    // 4. Attempt Upsert
    // We try to save everything first
    let result = await adminSupabase
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
      .maybeSingle();

    // 5. Fallback for Schema Desync
    if (result.error && result.error.message.includes('blueprint_sql')) {
       console.warn("⚠️ Grid Update Fallback: blueprint_sql column missing in DB.");
       result = await adminSupabase
         .from('neural_brain')
         .upsert({
            id: 'system-brain',
            master_prompt: master_prompt || "",
            is_active: true,
            updated_at: new Date().toISOString(),
            version: nextVersion
         }, { onConflict: 'id' })
         .select()
         .maybeSingle();
       
       if (!result.error) {
         return NextResponse.json({
           success: true,
           partial: true,
           message: "Prompt persisted, but blueprint ignored due to missing DB column.",
           brain: result.data
         });
       }
    }

    if (result.error) throw result.error;

    return NextResponse.json({
      success: true,
      message: "Neural Brain re-aligned and persisted to vault.",
      brain: result.data
    });
  } catch (error: any) {
    console.error("❌ [Brain Update Fault]:", error);
    return NextResponse.json({ 
      error: error.message || "Synthesis grid exception during persistence." 
    }, { status: 500 });
  }
}