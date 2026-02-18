import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await props.params;
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = getSupabaseServerClient(token);

    const [docRes, sloRes] = await Promise.all([
      supabase.from('documents').select('*').eq('id', documentId).single(),
      supabase.from('slo_database').select('*').eq('document_id', documentId).order('slo_code', { ascending: true })
    ]);

    if (docRes.error || !docRes.data) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: docRes.data.id,
      status: docRes.data.status,
      name: docRes.data.name,
      progress: docRes.data.status === 'ready' ? 100 : (docRes.data.rag_indexed ? 80 : 20),
      summary: docRes.data.document_summary,
      error: docRes.data.error_message,
      slos: sloRes.data || [],
      metadata: {
        subject: docRes.data.subject,
        grade: docRes.data.grade_level,
        indexed: docRes.data.rag_indexed
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}