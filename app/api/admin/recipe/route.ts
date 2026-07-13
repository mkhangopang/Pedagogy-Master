import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase';
import { checkAdmin } from '../../../../lib/auth/user-role';

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

    if (!await checkAdmin(supabase, user.id)) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
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
