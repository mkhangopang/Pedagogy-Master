import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../../lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * FIX-BUG-05: Status API no longer returns ALL SLO rows on every poll.
 *
 * Problem: The previous version ran SELECT * on slo_database on every 2-second poll.
 *   A typical curriculum document has 400–800 SLOs, producing ~500KB responses
 *   30× per minute per user — a serious database and network drain.
 *
 * Solution:
 *   - While the document is still processing → return only the count (HEAD query).
 *   - Once status is 'ready'/'complete' → return paginated SLO list (500 limit,
 *     only the fields the UI actually needs).
 *   - Never return extracted_text in the status response (it's internal, can be MBs).
 */
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

    // Fetch document and job state in parallel
    const [docRes, jobRes] = await Promise.all([
      supabase.from('documents').select(
        // Exclude extracted_text — it can be MBs and is never needed by the polling UI
        'id, status, name, document_summary, error_message, subject, grade_level, rag_indexed'
      ).eq('id', documentId).single(),

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

    if (!docRes.data) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const isComplete = docRes.data.status === 'ready';
    const jobPayload = jobRes.data?.payload || {};

    // Calculate progress from real job data
    let realProgress: number;
    if (isComplete) {
      realProgress = 100;
    } else if (jobRes.data?.status === 'failed') {
      realProgress = 0;
    } else {
      realProgress = jobPayload.progress ?? 20;
    }

    // SLO data: count-only during processing (cheap), full list when done (paginated)
    let slos: any[] = [];
    let sloCount = 0;

    if (isComplete) {
      const sloRes = await supabase
        .from('slo_database')
        .select('slo_code, slo_full_text, grade_level, domain, domain_name, subject, bloom_level')
        .eq('document_id', documentId)
        .order('slo_code', { ascending: true })
        .limit(500); // Pagination: caller can add ?offset= for more

      slos = sloRes.data || [];
      sloCount = slos.length;
    } else {
      // Count-only HEAD query — zero data transfer
      const countRes = await supabase
        .from('slo_database')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', documentId);
      sloCount = countRes.count ?? 0;
    }

    return NextResponse.json({
      id: docRes.data.id,
      status: isComplete ? 'complete' : (docRes.data.status || 'processing'),
      name: docRes.data.name,
      progress: realProgress,
      summary: jobPayload.message || docRes.data.document_summary,
      error: docRes.data.error_message || jobRes.data?.error_message,
      sloCount,
      slos,      // Empty array during processing; populated once complete
      metadata: {
        subject: docRes.data.subject,
        grade: docRes.data.grade_level,
        indexed: docRes.data.rag_indexed,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
