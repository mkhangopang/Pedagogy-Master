import { NextRequest, NextResponse } from 'next/server';
import { supabase, createPrivilegedClient } from '../../../../lib/supabase';

/**
 * UPLOAD PHASE 3: COMPLETE
 * Marks the document as 'ready' for the AI engine.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Session invalid' }, { status: 401 });

    const { docId } = await req.json();

    if (!docId) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const admin = createPrivilegedClient();
    const { data, error } = await admin
      .from('documents')
      .update({ status: 'ready' })
      .eq('id', docId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, doc: data });
  } catch (err: any) {
    console.error("Upload Completion Failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
