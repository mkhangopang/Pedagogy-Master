import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../lib/supabase';
import { kv } from '../../../lib/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const grade = (searchParams.get('grade') || '').trim().slice(0, 32);
  const subject = (searchParams.get('subject') || '').trim().slice(0, 64);
  const query = (searchParams.get('q') || '').trim().slice(0, 120);
  const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isFinite(parsedPage) ? Math.min(1000, Math.max(1, parsedPage)) : 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const cacheKey = `explore:${grade}:${subject}:${query}:${page}`;
  const cached = await kv.get<any>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' }
    });
  }

  const supabase = getSupabaseAdminClient();

  let dbQuery = supabase
    .from('slo_database')
    .select(`
      slo_code, slo_full_text, bloom_level, domain, domain_name,
      documents!inner (id, name, authority, grade_level, subject, version_year, is_public)
    `, { count: 'exact' })
    .eq('documents.is_public', true);

  if (grade) dbQuery = dbQuery.eq('documents.grade_level', grade);
  if (subject) dbQuery = dbQuery.ilike('documents.subject', `%${subject}%`);
  if (query) dbQuery = dbQuery.ilike('slo_full_text', `%${query}%`);

  const { data, count, error } = await dbQuery
    .order('slo_code', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[Explore GET] Query error:', error);
    return NextResponse.json({ error: 'Failed to load curriculum standards' }, { status: 500 });
  }

  const { data: filterOptions } = await supabase
    .from('documents')
    .select('grade_level, subject')
    .eq('is_public', true)
    .limit(200);

  const grades = [...new Set((filterOptions || []).map((d: any) => d.grade_level).filter(Boolean))].sort();
  const subjects = [...new Set((filterOptions || []).map((d: any) => d.subject).filter(Boolean))].sort();

  const response = {
    slos: data || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    },
    filters: { grades, subjects },
    meta: {
      description: `Browse ${count || 0} curriculum SLOs${grade ? ` for Grade ${grade}` : ''}${subject ? ` in ${subject}` : ''}`
    }
  };

  await kv.set(cacheKey, response, 600);

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' }
  });
}
