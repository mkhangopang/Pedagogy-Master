import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase';
import { ADMIN_EMAILS } from '../../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token || token === 'undefined') {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });
    }

    const isAdmin = user.email && ADMIN_EMAILS.some(e => e.toLowerCase() === user.email?.toLowerCase());
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const authenticatedSupabase = getSupabaseServerClient(token);

    // 1. Check Vector Extension
    let extensionActive = true;
    try {
      const { data } = await authenticatedSupabase.rpc('get_extension_status', { ext: 'vector' });
      extensionActive = !!data;
    } catch (e) {
      console.warn("RPC get_extension_status failed, assuming active if chunks exist.");
    }
    
    // 2. Check Chunk Statistics via View
    const { data: healthReport, error: healthError } = await authenticatedSupabase.from('rag_health_report').select('*');
    if (healthError) {
      console.error("Health report view failed:", healthError);
      return NextResponse.json({ error: "Diagnostic view 'rag_health_report' not found in database. Please run the SQL migration." }, { status: 500 });
    }

    // 3. Check for embedding dimension consistency
    let dimensions = 768;
    try {
      const { data } = await authenticatedSupabase.rpc('get_vector_dimensions');
      if (data) dimensions = Number(data);
    } catch (e) {
      console.warn("RPC get_vector_dimensions failed.");
    }

    // 4. Ghost Chunks (Orphaned chunks with no valid document)
    const { data: allDocs } = await authenticatedSupabase.from('documents').select('id');
    const docIds = allDocs?.map(d => d.id) || [];
    
    let orphans = 0;
    if (docIds.length > 0) {
      const { count } = await authenticatedSupabase
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .not('document_id', 'in', `(${docIds.join(',')})`);
      orphans = count || 0;
    } else {
      const { count } = await authenticatedSupabase
        .from('document_chunks')
        .select('*', { count: 'exact', head: true });
      orphans = count || 0;
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      extensionActive,
      expectedDimensions: 768,
      actualDimensions: dimensions,
      report: healthReport || [],
      summary: {
        totalDocs: (healthReport || []).length,
        healthy: (healthReport || []).filter((r: any) => r.health_status === 'HEALTHY').length,
        broken: (healthReport || []).filter((r: any) => r.health_status && r.health_status.startsWith('BROKEN')).length,
        orphanedChunks: orphans
      }
    });

  } catch (error: any) {
    console.error("RAG Health API Fatal:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}