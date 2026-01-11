import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { ADMIN_EMAILS } from '../../../../constants';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for bulk task

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    // Admin Check
    const isAdmin = user.email && ADMIN_EMAILS.some(e => e.toLowerCase() === user.email?.toLowerCase());
    if (!isAdmin) return NextResponse.json({ error: 'Admin privileges required' }, { status: 403 });

    const supabase = getSupabaseServerClient(token);

    // Get all documents that have text but aren't indexed or need refresh
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('id, name, extracted_text')
      .not('extracted_text', 'is', null);

    if (fetchError) throw fetchError;

    if (!documents || documents.length === 0) {
      return NextResponse.json({ message: 'No documents found with extractable text.' });
    }

    console.log(`[ADMIN] Bulk Indexing ${documents.length} documents...`);

    const results = [];
    for (const doc of documents) {
      try {
        await indexDocumentForRAG(doc.id, doc.extracted_text, supabase);
        results.push({ id: doc.id, name: doc.name, status: 'success' });
      } catch (e: any) {
        results.push({ id: doc.id, name: doc.name, status: 'error', error: e.message });
      }
    }

    return NextResponse.json({
      summary: {
        total: documents.length,
        success: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length
      },
      details: results
    });

  } catch (error: any) {
    console.error('[BULK INDEX ERROR]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}