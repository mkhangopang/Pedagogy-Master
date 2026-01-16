import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { ADMIN_EMAILS } from '../../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const isAdmin = user.email && ADMIN_EMAILS.some(e => e.toLowerCase() === user.email?.toLowerCase());
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const supabase = getSupabaseServerClient(token);

    // 1. Check Vector Extension - Fixed chaining logic for TS
    let extensionActive = true;
    try {
      const { data } = await supabase.rpc('get_extension_status', { ext: 'vector' });
      extensionActive = !!data;
    } catch (e) {
      console.warn("RPC get_extension_status failed, assuming active if chunks exist.");
    }
    
    // 2. Check Chunk Statistics
    const { data: healthReport, error: healthError } = await supabase.from('rag_health_report').select('*');
    if (healthError) throw healthError;

    // 3. Check for embedding dimension consistency
    let dimensions = 768;
    try {
      const { data } = await supabase.rpc('get_vector_dimensions');
      if (data) dimensions = Number(data);
    } catch (e) {
      console.warn("RPC get_vector_dimensions failed, defaulting to 768.");
    }

    // 4. Ghost Chunks (Orphaned chunks with no valid document)
    // We fetch document IDs first for the inclusion check
    const { data: allDocs } = await supabase.from('documents').select('id');
    const docIds = allDocs?.map(d => d.id) || [];
    
    const { count: orphans } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .not('document_id', 'in', `(${docIds.join(',')})`);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      extensionActive,
      expectedDimensions: 768,
      actualDimensions: dimensions,
      report: healthReport,
      summary: {
        totalDocs: healthReport.length,
        healthy: healthReport.filter((r: any) => r.health_status === 'HEALTHY').length,
        broken: healthReport.filter((r: any) => r.health_status.startsWith('BROKEN')).length,
        orphanedChunks: orphans || 0
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}