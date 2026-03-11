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

    const [docRes, sloRes, jobRes] = await Promise.all([
      supabase.from('documents').select('*').eq('id', documentId).single(),
      supabase.from('slo_database').select('*').eq('document_id', documentId).order('slo_code', { ascending: true }),
      supabase.from('ingestion_jobs').select('*').eq('document_id', documentId).neq('status', 'complete').maybeSingle()
    ]);

    if (docRes.error || !docRes.data) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Calculate real progress based on job state
    let realProgress = docRes.data.status === 'ready' ? 100 : 20;
    if (docRes.data.status !== 'ready' && jobRes.data) {
      const jobPayload = jobRes.data.payload || {};
      realProgress = jobPayload.progress || realProgress;
    }

    return NextResponse.json({
      id: docRes.data.id,
      status: docRes.data.status === 'ready' ? 'complete' : docRes.data.status,
      name: docRes.data.name,
      progress: realProgress,
      summary: docRes.data.document_summary || jobRes.data?.payload?.message,
      error: docRes.data.error_message || jobRes.data?.error_message,
      slos: sloRes.data || [],
      extracted_text: docRes.data.extracted_text,
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