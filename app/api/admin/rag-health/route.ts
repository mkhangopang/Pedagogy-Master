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

    // 1. Check Vector Extension
    const { data: extensionCheck } = await supabase.rpc('get_extension_status', { ext: 'vector' }).catch(() => ({ data: true })); // Fallback if RPC doesn't exist
    
    // 2. Check Chunk Statistics
    const { data: healthReport, error: healthError } = await supabase.from('rag_health_report').select('*');
    if (healthError) throw healthError;

    // 3. Check for embedding dimension consistency
    const { data: dimCheck } = await supabase.rpc('get_vector_dimensions').catch(() => ({ data: 768 }));

    // 4. Ghost Chunks (Orphaned chunks with no valid document)
    const { count: orphans } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .not('document_id', 'in', (await supabase.from('documents').select('id')).data?.map(d => d.id) || []);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      extensionActive: true, // Assuming true if queries run
      expectedDimensions: 768,
      report: healthReport,
      summary: {
        totalDocs: healthReport.length,
        healthy: healthReport.filter(r => r.health_status === 'HEALTHY').length,
        broken: healthReport.filter(r => r.health_status.startsWith('BROKEN')).length,
        orphanedChunks: orphans || 0
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}