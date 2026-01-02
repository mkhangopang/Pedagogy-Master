import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '../../../lib/supabase';
import { ADMIN_EMAILS } from '../../../constants';

type TestResult = {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const isAdmin = user.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
  if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const results: TestResult[] = [];

  // 1. Env Check
  const envCheck = {
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    apiKey: !!process.env.API_KEY,
  };
  results.push({
    name: 'Environment Configuration',
    status: Object.values(envCheck).every(v => v) ? 'pass' : 'fail',
    message: 'Essential keys verified',
    details: envCheck
  });

  // 2. Database Check
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    results.push({
      name: 'Supabase Database',
      status: !error ? 'pass' : 'fail',
      message: error ? error.message : 'Database responsive'
    });
  } catch (e: any) {
    results.push({ name: 'Supabase Database', status: 'fail', message: e.message });
  }

  // 3. AI Engine Check
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'Ping'
    });
    results.push({
      name: 'Gemini AI Engine',
      status: response.text ? 'pass' : 'warning',
      message: 'AI Handshake successful'
    });
  } catch (e: any) {
    results.push({ name: 'Gemini AI Engine', status: 'fail', message: e.message });
  }

  return NextResponse.json({
    summary: {
      overall: results.every(r => r.status !== 'fail') ? 'pass' : 'fail',
      timestamp: new Date().toISOString()
    },
    tests: results
  });
}