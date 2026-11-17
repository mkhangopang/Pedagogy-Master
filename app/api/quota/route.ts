import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { getAiQuotaStatus } from '../../../lib/rate-limit/free-tier-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token || token === 'undefined' || token.length < 10) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseServerClient(token);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const quota = await getAiQuotaStatus({
      supabase,
      userId: user.id,
      authEmail: user.email,
    });

    return NextResponse.json({ quota });
  } catch {
    return NextResponse.json({ error: 'Failed to inspect quota' }, { status: 500 });
  }
}
