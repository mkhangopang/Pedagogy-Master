
import { NextRequest, NextResponse } from 'next/server';
import { createPrivilegedClient, supabase as anonClient } from '../../../../lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    // 1. Verify user session via the token (Secure)
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await req.json();
    const { doc } = body;

    if (!doc || !doc.id) {
      return NextResponse.json({ error: 'Missing document payload' }, { status: 400 });
    }

    // 2. Use Privileged Client to bypass RLS (Performance)
    const adminClient = createPrivilegedClient();
    
    const { error: dbError } = await adminClient
      .from('documents')
      .upsert({
        id: doc.id,
        user_id: user.id,
        name: doc.name,
        file_path: doc.filePath,
        mime_type: doc.mimeType,
        status: doc.status || 'completed',
        subject: doc.subject || 'General',
        grade_level: doc.gradeLevel || 'Auto',
        slo_tags: doc.sloTags || [],
        created_at: doc.createdAt || new Date().toISOString()
      });

    if (dbError) {
      console.error("Privileged Insert Error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, docId: doc.id });
  } catch (err: any) {
    console.error("API Register Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
