import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { indexDocumentForRAG } from '../../../lib/rag/document-indexer';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { documentId } = await req.json();
    if (!documentId) return NextResponse.json({ error: 'Document ID required' }, { status: 400 });

    const supabase = getSupabaseServerClient(token);

    // Fetch document to get text
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    
    const textToProcess = doc.extracted_text || "";
    if (!textToProcess) {
      return NextResponse.json({ error: 'No text content available to index.' }, { status: 400 });
    }

    // Trigger re-indexing
    await indexDocumentForRAG(documentId, textToProcess, supabase);

    return NextResponse.json({
      success: true,
      message: `Document ${doc.name} successfully re-indexed into vector grid.`,
      id: documentId
    });

  } catch (error: any) {
    console.error('[REINDEX ERROR]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}