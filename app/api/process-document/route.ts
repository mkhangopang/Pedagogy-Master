import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

/**
 * NOTE: Most AI logic has been moved to /api/ai for unified task handling.
 * This route is now a placeholder for potential future raw file processing.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  return NextResponse.json({ message: "Use /api/ai for document processing tasks." }, { status: 200 });
}