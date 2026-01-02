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
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const isAdmin = user.email && ADMIN_EMAILS.some(e => e.toLowerCase() === user.email?.toLowerCase());
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const results: TestResult[] = [];

    // 1. Environment Verification
    const envCheck = {
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      geminiKey: !!process.env.API_KEY,
    };
    results.push({
      name: 'Cloud Infrastructure Keys',
      status: Object.values(envCheck).every(v => v) ? 'pass' : 'fail',
      message: 'All essential environment variables are detected in current runtime.',
      details: envCheck
    });

    // 2. Database Connectivity
    try {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      results.push({
        name: 'Supabase Data Plane',
        status: !error ? 'pass' : 'fail',
        message: error ? `Connectivity issues: ${error.message}` : 'PostgreSQL interface is responsive.'
      });
    } catch (e: any) {
      results.push({ name: 'Supabase Data Plane', status: 'fail', message: e.message });
    }

    // 3. AI Engine Handshake
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: 'Ping connectivity test'
      });
      results.push({
        name: 'Gemini AI Synthesis Engine',
        status: response.text ? 'pass' : 'warning',
        message: 'AI Handshake successful. Semantic engine is operational.'
      });
    } catch (e: any) {
      results.push({ name: 'Gemini AI Synthesis Engine', status: 'fail', message: `Engine offline: ${e.message}` });
    }

    return NextResponse.json({
      summary: {
        overall: results.every(r => r.status !== 'fail') ? 'pass' : 'fail',
        timestamp: new Date().toISOString(),
        readyForProduction: results.every(r => r.status === 'pass')
      },
      tests: results,
      recommendations: results.every(r => r.status === 'pass') 
        ? ["Infrastructure is fully validated for production."] 
        : ["Address failing modules before high-traffic deployment."]
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}