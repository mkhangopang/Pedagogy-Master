import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { ADMIN_EMAILS } from '../../../../constants';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5-minute timeout

/**
 * ADMIN BULK INDEXING
 * Synchronizes all documents in the library that haven't been processed by the RAG engine.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    // Privilege verification
    const isAdmin = user.email && ADMIN_EMAILS.some(e => e.toLowerCase() === user.email?.toLowerCase());
    if (!isAdmin) return NextResponse.json({ error: 'Administrative privileges required.' }, { status: 403 });

    console.log('🔄 [ADMIN] Starting bulk curriculum indexing operation...');

    const supabase = getSupabaseServerClient(token);

    // Identify assets requiring neural synchronization
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .or('gemini_processed.eq.false,status.neq.ready');

    if (fetchError) throw fetchError;

    if (!documents || documents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Neural grid is already fully synchronized.',
        indexedCount: 0,
      });
    }

    console.log(`📄 [ADMIN] Found ${documents.length} assets to index.`);

    const results = [];
    let successCount = 0;

    for (const doc of documents) {
      try {
        console.log(`🔍 [ADMIN] Processing: ${doc.name}`);

        // Trigger indexing - helper fetches from R2 if needed
        await indexDocumentForRAG(doc.id, doc.file_path, supabase);

        console.log(`✅ [ADMIN] Indexed: ${doc.name}`);
        results.push({ name: doc.name, success: true });
        successCount++;
      } catch (docError: any) {
        console.error(`❌ [ADMIN] Error on ${doc.name}:`, docError);
        results.push({ name: doc.name, success: false, error: docError.message });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Operation complete. Synchronized ${successCount} of ${documents.length} assets.`,
      stats: {
        total: documents.length,
        success: successCount,
        failed: documents.length - successCount
      },
      results,
    });

  } catch (error: any) {
    console.error('❌ [ADMIN] Bulk indexing fatal error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Support GET for easy browser execution in development environments.
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
