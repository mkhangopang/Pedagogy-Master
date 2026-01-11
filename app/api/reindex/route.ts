import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { indexDocumentForRAG } from '../../../lib/rag/document-indexer';
import { getObjectText } from '../../../lib/r2';

export const runtime = 'nodejs';

/**
 * REINDEX ENDPOINT
 * Refreshes the RAG vector plane for a single document.
 * Checks for text in the database first, falling back to R2 storage if necessary.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const { documentId } = await req.json();
    if (!documentId) return NextResponse.json({ error: 'Document ID required' }, { status: 400 });

    const supabase = getSupabaseServerClient(token);

    console.log(`\n🔄 [REINDEX] Force-refreshing neural nodes for document: ${documentId}`);

    // Get document details
    const { data: doc, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found or unauthorized access attempt.' }, { status: 404 });
    }

    // 1. Source Text Retrieval
    let documentText = doc.extracted_text;

    // Fallback to R2 if text is missing from the database (Edge case for early uploads)
    if (!documentText && doc.file_path) {
      console.log(`📥 [REINDEX] Text missing from database. Fetching from storage node: ${doc.file_path}`);
      try {
        documentText = await getObjectText(doc.file_path);
      } catch (e) {
        console.warn(`⚠️ [REINDEX] Storage fetch failed:`, e);
      }
    }

    if (!documentText || documentText.trim().length === 0) {
      return NextResponse.json({ error: 'No indexable content found. Ensure the document contains text.' }, { status: 400 });
    }

    // 2. Perform Atomic Re-index
    await indexDocumentForRAG(documentId, documentText, supabase);

    console.log(`✅ [REINDEX] "${doc.name}" is now fully synchronized with the AI synthesis grid.`);

    return NextResponse.json({
      success: true,
      message: `Document "${doc.name}" reindexed successfully.`,
      documentId,
      name: doc.name
    });

  } catch (error: any) {
    console.error('❌ [REINDEX FATAL ERROR]:', error);
    return NextResponse.json({ error: error.message || 'The neural grid encountered a synchronization fault.' }, { status: 500 });
  }
}
