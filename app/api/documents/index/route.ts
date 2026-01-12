
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { getObjectText } from '../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Extend timeout to 5 minutes for large curriculum files

/**
 * MANUAL INDEX TRIGGER
 * Used to synchronize legacy or failed uploads with the neural vector grid.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { documentId } = await request.json();
    
    if (!documentId) {
      return NextResponse.json({ error: 'documentId required' }, { status: 400 });
    }
    
    const supabase = getSupabaseServerClient(token);

    // Verify document existence and ownership
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();
    
    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found or access denied.' }, { status: 404 });
    }
    
    // Attempt text retrieval for indexing
    let text = doc.extracted_text;
    if (!text && doc.file_path) {
      try {
        text = await getObjectText(doc.file_path);
      } catch (r2Err) {
        console.error('[R2 Fetch Fail during Index]:', r2Err);
      }
    }
    
    if (!text || text.length < 10) {
      return NextResponse.json({ error: 'No usable text content found for indexing.' }, { status: 422 });
    }
    
    // Execute indexing with higher timeout resilience
    try {
      await indexDocumentForRAG(documentId, text, doc.file_path, supabase);
    } catch (indexErr: any) {
      console.error('[Indexing Logic Failure]:', indexErr);
      return NextResponse.json({ 
        error: `Neural processing failed: ${indexErr.message || 'The operation took too long or the document format is invalid.'}` 
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: `Curriculum asset "${doc.name}" indexed successfully.`,
    });
    
  } catch (error: any) {
    console.error('[Index API Fatal]:', error);
    return NextResponse.json({ error: error.message || 'Indexing operation failed.' }, { status: 500 });
  }
}
