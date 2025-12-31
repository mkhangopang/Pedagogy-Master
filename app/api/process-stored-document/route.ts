import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

/**
 * DEPRECATED: Use /api/ai with the 'chat' or 'extract-slos' task for direct document processing.
 * This route remains for backward compatibility with document retrieval only.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { documentId, userId } = await request.json();
    
    // Ensure user is only accessing their own documents
    if (!documentId || !userId || userId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized or missing IDs' }, { status: 400 });
    }

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