import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { indexDocumentForRAG } from '../../../lib/rag/document-indexer';
import { getObjectText } from '../../../lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * REINDEX ENDPOINT
 * Triggers a neural refresh for a specific curriculum asset.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { documentId } = await req.json();
    if (!documentId) return NextResponse.json({ error: 'Document ID is mandatory' }, { status: 400 });

    const supabase = getSupabaseServerClient(token);

    // Verify ownership
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Asset not found or unauthorized access.' }, { status: 404 });
    }

    console.log(`🔄 [REINDEX] Refreshing neural nodes for: ${doc.name}`);

    let textToProcess = doc.extracted_text;
    if (!textToProcess && doc.file_path) {
       try {
         textToProcess = await getObjectText(doc.file_path);
       } catch (r2Err) {
         console.warn(`[REINDEX] R2 Fetch failed:`, r2Err);
       }
    }

    if (!textToProcess || textToProcess.length < 10) {
      return NextResponse.json({ error: 'The document has no extractable text.' }, { status: 422 });
    }

    // Fix: Aligned with (id, content, supabase) signature
    await indexDocumentForRAG(documentId, textToProcess, supabase);

    return NextResponse.json({
      success: true,
      message: `Document "${doc.name}" synchronized.`,
      id: documentId
    });

  } catch (error: any) {
    console.error('❌ [REINDEX] Failed:', error);
    return NextResponse.json({ error: error.message || 'Synchronization failure' }, { status: 500 });
  }
}