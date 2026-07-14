import { NextResponse } from 'next/server';
import { performanceMonitor } from '../../../lib/monitoring/performance';
import { embeddingCache } from '../../../lib/rag/embedding-cache';
// Removed missing ADMIN_EMAILS import from constants
import { getSupabaseServerClient } from '../../../lib/supabase';
import { checkAdmin } from '../../../lib/auth/user-role';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // 1. Authorization Check
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseServerClient(token);
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user || !await checkAdmin(supabase, user.id)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // 2. Aggregate Metrics
    const perfData = performanceMonitor.getSummary();
    const cacheData = embeddingCache.getStats();

    return NextResponse.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      grid: {
        performance: perfData,
        caching: cacheData
      },
      environment: process.env.VERCEL_ENV || 'development'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}