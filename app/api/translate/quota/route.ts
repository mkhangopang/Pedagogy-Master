import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase';
import { checkTranslationQuota } from '../../../../lib/translate/quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token || token === 'undefined' || token.length < 10) {
      return NextResponse.json({ error: 'Auth Required' }, { status: 401 });
    }

    const supabase = getSupabaseServerClient(token);
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });
    }

    const quota = await checkTranslationQuota(supabase, user.id, user.email);
    return NextResponse.json({ quota });
  } catch (error: any) {
    console.error('[Translate Quota API Fault]:', error);
    return NextResponse.json(
      { error: 'Unable to load translation quota status.' },
      { status: 500 }
    );
  }
}
