
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * GLOBAL NEURAL REFRESH
 * Ensures all curriculum assets are perfectly synchronized with the vector grid.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const adminString = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
    const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const isAdmin = user.email && adminEmails.includes(user.email.toLowerCase());
    if (!isAdmin) return NextResponse.json({ error: 'Administrative access required' }, { status: 403 });

    const supabase = getSupabaseServerClient(token);

    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('id, name, file_path, extracted_text');

    if (fetchError) throw fetchError;
    if (!documents || documents.length === 0) {
      return NextResponse.json({ success: true, message: 'Vault is empty.' });
    }

    console.log(`📄 [ADMIN] Bulk Ingesting ${documents.length} assets...`);

    let successCount = 0;
    for (const doc of documents) {
      try {
        // Fix: Removed doc.file_path to match (documentId, content, supabase, jobId?) signature
        await indexDocumentForRAG(doc.id, doc.extracted_text || "", supabase);
        successCount++;
      } catch (e: any) {
        console.error(`❌ Sync failed for ${doc.name}:`, e.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Neural Refresh Complete. ${successCount}/${documents.length} assets synchronized.`,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
