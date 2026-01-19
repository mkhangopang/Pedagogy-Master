import { NextResponse } from 'next/server';
import { performanceMonitor } from '../../../lib/monitoring/performance';
import { embeddingCache } from '../../../lib/rag/embedding-cache';
import { ADMIN_EMAILS } from '../../../constants';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // 1. Authorization Check
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
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