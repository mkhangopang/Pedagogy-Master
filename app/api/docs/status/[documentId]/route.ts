import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../../lib/supabase';
import { checkAdmin } from '../../../../../lib/auth/user-role';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await props.params;
    if (!documentId || !UUID_REGEX.test(documentId)) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseServerClient(token);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const includeText = req.nextUrl.searchParams.get('includeText') === '1';
    const docFields = includeText
      ? 'id, user_id, is_public, status, name, document_summary, error_message, subject, grade_level, rag_indexed, extracted_text'
      : 'id, user_id, is_public, status, name, document_summary, error_message, subject, grade_level, rag_indexed';

    const [docRes, jobRes] = await Promise.all([
      supabase.from('documents').select(docFields).eq('id', documentId).single(),

      supabase.from('ingestion_jobs')
        .select('*')
        .eq('document_id', documentId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (docRes.error) {
      if (docRes.error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      console.error(`[Status API] Document fetch error for ${documentId}:`, docRes.error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const docData = docRes.data as any;
    if (!docData) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (docData.user_id !== user.id && !docData.is_public) {
      const isAdmin = await checkAdmin(supabase, user.id);
      if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const isComplete = docData.status === 'ready';
    const jobPayload = jobRes.data?.payload || {};

    let realProgress: number;
    if (isComplete) {
      realProgress = 100;
    } else if (jobRes.data?.status === 'failed') {
      realProgress = 0;
    } else {
      realProgress = jobPayload.progress ?? 20;
    }

    let slos: any[] = [];
    let sloCount = 0;

    if (isComplete) {
      const sloRes = await supabase
        .from('slo_database')
        .select('slo_code, slo_full_text, grade_level, domain, domain_name, subject, bloom_level')
        .eq('document_id', documentId)
        .order('slo_code', { ascending: true })
        .limit(500);

      slos = sloRes.data || [];
      sloCount = slos.length;
    } else {
      const countRes = await supabase
        .from('slo_database')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', documentId);
      sloCount = countRes.count ?? 0;
    }

    return NextResponse.json({
      id: docData.id,
      status: isComplete ? 'complete' : (docData.status || 'processing'),
      name: docData.name,
      progress: realProgress,
      summary: jobPayload.message || docData.document_summary,
      error: docData.error_message || jobRes.data?.error_message,
      sloCount,
      slos,
      extracted_text: includeText ? (docData.extracted_text || null) : undefined,
      metadata: {
        subject: docData.subject,
        grade: docData.grade_level,
        indexed: docData.rag_indexed,
      },
    });
  } catch (error: any) {
    console.error('[Status API] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to retrieve document status' }, { status: 500 });
  }
}
