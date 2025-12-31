import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

type TestResult = {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
  fix?: string;
};

export async function GET(request: NextRequest) {
  const results: TestResult[] = [];
  let overallStatus: 'pass' | 'fail' = 'pass';

  // Test 1: Environment Variables
  const envCheck = {
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    apiKey: !!process.env.API_KEY,
  };
  const allPresent = Object.values(envCheck).every(v => v);
  results.push({
    name: '1. Environment Variables',
    status: allPresent ? 'pass' : 'fail',
    message: allPresent ? 'All required environment variables are set' : 'Missing required environment variables',
    details: envCheck,
    fix: !allPresent ? 'Check your deployment settings for API_KEY, NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY.' : undefined
  });
  if (!allPresent) overallStatus = 'fail';

  // Test 2: Supabase Connection
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) throw error;
    results.push({
      name: '2. Supabase Connection',
      status: 'pass',
      message: 'Database is accessible.'
    });
  } catch (error: any) {
    results.push({
      name: '2. Supabase Connection',
      status: 'fail',
      message: 'Failed to connect to Supabase.',
      details: error.message
    });
    overallStatus = 'fail';
  }

  // Test 3: Gemini API Health
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'Respond with just "OK".',
    });
    const text = response.text?.trim();
    results.push({
      name: '3. Gemini API Health',
      status: text === 'OK' ? 'pass' : 'warning',
      message: text === 'OK' ? 'Gemini 3 Flash is responding correctly.' : 'Unexpected API response.',
      details: { response: text }
    });
  } catch (error: any) {
    results.push({
      name: '3. Gemini API Health',
      status: 'fail',
      message: 'Gemini API call failed.',
      details: error.message
    });
    overallStatus = 'fail';
  }

  return NextResponse.json({
    summary: {
      overall: overallStatus,
      passed: results.filter(r => r.status === 'pass').length,
      failed: results.filter(r => r.status === 'fail').length,
      total: results.length,
      timestamp: new Date().toISOString()
    },
    tests: results
  });
}