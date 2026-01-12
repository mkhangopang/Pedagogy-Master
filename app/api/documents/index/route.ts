import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { getObjectText } from '../../../lib/r2';
import { indexDocumentForRAG } from '../../../lib/rag/document-indexer';

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

    // Get document from database
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();
    
    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    
    // Fetch text from DB or R2
    let text = doc.extracted_text;
    if (!text && doc.file_path) {
      text = await getObjectText(doc.file_path);
    }
    
    if (!text) {
      return NextResponse.json({ error: 'No document text found' }, { status: 404 });
    }
    
    // Index the document
    await indexDocumentForRAG(documentId, text, doc.file_path, supabase);
    
    return NextResponse.json({
      success: true,
      message: `Document indexed successfully.`,
    });
    
  } catch (error: any) {
    console.error('Indexing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
