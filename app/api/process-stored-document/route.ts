
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

/**
 * DEPRECATED: Use /api/ai with the 'chat' or 'extract-slos' task for direct document processing.
 * This route remains for backward compatibility with document retrieval only.
 */
export async function POST(request: NextRequest) {
  try {
    const { documentId, userId } = await request.json();
    if (!documentId || !userId) return NextResponse.json({ error: 'Missing IDs' }, { status: 400 });

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (docError || !doc) return NextResponse.json({ error: 'Doc not found' }, { status: 404 });

    return NextResponse.json({ 
      document: doc,
      status: 'Ready for /api/ai processing'
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Retrieval failed' }, { status: 500 });
  }
}
