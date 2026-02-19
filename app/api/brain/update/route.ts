import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';

/**
 * NEURAL BRAIN UPDATE GATEWAY (v11.2 - RESILIENT)
 * Logic: Atomic upsert with automatic schema-fallback.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized: Gateway closed.' }, { status: 401 });

    const { master_prompt, blueprint_sql } = await req.json();
    
    const userClient = getSupabaseServerClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Session Invalid.' }, { status: 401 });

    const adminSupabase = getSupabaseAdminClient();
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'app_admin') {
      return NextResponse.json({ error: 'Access Denied: Founder privileges required.' }, { status: 403 });
    }

    // 1. Attempt standard update
    let result = await adminSupabase
      .from('neural_brain')
      .upsert({
        id: 'system-brain',
        master_prompt: master_prompt || "",
        blueprint_sql: blueprint_sql || "",
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select()
      .maybeSingle();

    // 2. Handle type or column mismatch
    if (result.error) {
       const isTypeMismatch = result.error.message.includes('uuid');
       const isMissingCol = result.error.message.includes('blueprint_sql');
       
       if (isTypeMismatch || isMissingCol) {
          console.error("❌ Schema Conflict:", result.error.message);
          return NextResponse.json({ 
            error: isTypeMismatch 
              ? "SCHEMA CONFLICT: The 'id' column is UUID but should be TEXT. Copy the script from Blueprint tab and run it in Supabase." 
              : "SCHEMA CONFLICT: Column 'blueprint_sql' missing. Use repair script."
          }, { status: 400 });
       }
       throw result.error;
    }

    return NextResponse.json({
      success: true,
      message: "Neural Brain re-aligned.",
      brain: result.data
    });
  } catch (error: any) {
    console.error("❌ [Brain Update Fault]:", error);
    return NextResponse.json({ 
      error: error.message || "Synthesis grid exception." 
    }, { status: 500 });
  }
}