import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks } from '../../../lib/rag/retriever';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const url = new URL(req.url);
    const query = url.searchParams.get('q') || '';
    
    if (!query) return NextResponse.json({ error: 'Missing query parameter "q"' }, { status: 400 });

    const supabase = getSupabaseServerClient(token);
    
    // Get currently selected docs for this user
    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_selected', true);

    const docIds = selectedDocs?.map(d => d.id) || [];

    if (docIds.length === 0) {
      return NextResponse.json({ 
        error: 'No documents selected. RAG search cannot proceed.',
        docs: [] 
      }, { status: 400 });
    }

    const chunks = await retrieveRelevantChunks(query, docIds, supabase, 5);

    return NextResponse.json({
      query,
      timestamp: new Date().toISOString(),
      documentContext: selectedDocs,
      resultsFound: chunks.length,
      chunks: chunks.map(c => ({
        id: c.id,
        text: c.text.substring(0, 300) + '...',
        similarity: (c.similarity * 100).toFixed(2) + '%',
        slos: c.sloCodes
      }))
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
