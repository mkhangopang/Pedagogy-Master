import { NextResponse } from 'next/server';
import { getSynthesizer } from '../../../lib/ai/synthesizer-core';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser(token);
    
    const adminString = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
    const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (!user || !adminEmails.includes((user.email || '').toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    getSynthesizer().realignGrid();

    return NextResponse.json({
      success: true,
      message: "Neural grid re-aligned. All segments ready for synthesis.",
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}