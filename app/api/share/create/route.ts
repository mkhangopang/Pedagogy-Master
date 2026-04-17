import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token || token.length < 10) {
      return NextResponse.json({ error: 'Auth Required' }, { status: 401 });
    }

    const supabase = getSupabaseServerClient(token);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { title, content, contentType, metadata } = body;

    if (!title || !content || !contentType) {
      return NextResponse.json({ error: 'title, content, contentType required' }, { status: 400 });
    }

    const shareId = generateShareId();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const { error } = await supabase.from('share_cards').insert({
      id: shareId,
      user_id: user.id,
      title,
      content,
      content_type: contentType,
      metadata: metadata || {},
      view_count: 0,
      signup_conversions: 0,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString()
    });

    if (error) throw error;

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pedagogy-master.vercel.app';
    return NextResponse.json({
      shareId,
      url: `${baseUrl}/s/${shareId}`,
      expiresAt: expiresAt.toISOString()
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function generateShareId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
