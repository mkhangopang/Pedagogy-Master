import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // 1. Verify Admin Status
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseServerClient(token);
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, plan')
      .eq('id', user.id)
      .single();

    const adminString = process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
    const adminEmails = adminString.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const isEmailAdmin = user.email && adminEmails.includes(user.email.toLowerCase());

    if (!profile || (profile.role !== 'app_admin' && !isEmailAdmin)) {
      return NextResponse.json({ error: 'Forbidden: Founder access required' }, { status: 403 });
    }

    // 2. Return Secrets from Environment Variables
    // This ensures they are NEVER committed to the public GitHub repository.
    const sqlSchema = process.env.FOUNDER_SQL_SCHEMA || `-- FOUNDER_SQL_SCHEMA environment variable is not set.
-- Please add your private SQL schema to your environment variables to view it here.
-- Example:
-- create table public.profiles (...);`;

    const masterPrompt = process.env.FOUNDER_MASTER_PROMPT || `You are Pedagogy Master AI...
(FOUNDER_MASTER_PROMPT environment variable is not set. Add your secret prompt to your environment variables.)`;

    return NextResponse.json({
      sqlSchema,
      masterPrompt
    });

  } catch (error: any) {
    console.error('Admin Recipe Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
