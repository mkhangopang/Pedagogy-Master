import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getSupabaseServerClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token || token.length < 10) {
      return NextResponse.json({ error: 'Auth Required' }, { status: 401 });
    }

    const supabase = getSupabaseServerClient(token);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const content = typeof body?.content === 'string' ? body.content.trim().slice(0, 100_000) : '';
    const contentType = typeof body?.contentType === 'string' ? body.contentType.trim().slice(0, 64) : '';
    const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {};

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
      metadata,
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
    console.error('[Share Create] Internal error:', err);
    return NextResponse.json({ error: 'Unable to create share card' }, { status: 500 });
  }
}

function generateShareId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(12);
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}
