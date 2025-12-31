import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '../../../lib/supabase';
import { ADMIN_EMAILS } from '../../../constants';

type TestResult = {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
  fix?: string;
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const isAdmin = user.email && ADMIN_EMAILS.some(email => email.toLowerCase() === user.email?.toLowerCase());
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized: Admin access only' }, { status: 403 });
  }

  const results: TestResult[] = [];
  let overallStatus: 'pass' | 'fail' = 'pass';

  // Test 1: Environment Variables
  try {
    const envCheck = {
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      apiKey: !!process.env.API_KEY,
      nodeEnv: process.env.NODE_ENV,
    };

    const allPresent = envCheck.supabaseUrl && envCheck.supabaseKey && envCheck.apiKey;

    results.push({
      name: '1. Environment Variables',
      status: allPresent ? 'pass' : 'fail',
      message: allPresent 
        ? 'All required environment variables are set' 
        : 'Missing required environment variables',
      details: envCheck,
      fix: !allPresent ? 'Add missing variables in Vercel Dashboard → Settings → Environment Variables, then redeploy' : undefined
    });

    if (!allPresent) overallStatus = 'fail';
  } catch (error: any) {
    results.push({
      name: '1. Environment Variables',
      status: 'fail',
      message: 'Failed to check environment variables',
      details: error.message
    });
    overallStatus = 'fail';
  }

  // Test 2: Supabase Connection
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id')
      .limit(1);

    if (error) throw error;

    results.push({
      name: '2. Supabase Database Connection',
      status: 'pass',
      message: 'Successfully connected to Supabase database',
      details: { table: 'documents', accessible: true }
    });
  } catch (error: any) {
    results.push({
      name: '2. Supabase Database Connection',
      status: 'fail',
      message: 'Failed to connect to Supabase database',
      details: error.message,
      fix: 'Verify Supabase URL and key in environment variables. Ensure "documents" table exists.'
    });
    overallStatus = 'fail';
  }

  // Test 3: Supabase Storage
  try {
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) throw bucketsError;

    const documentsBucket = buckets?.find(b => b.name === 'documents');

    if (!documentsBucket) {
      results.push({
        name: '3. Supabase Storage',
        status: 'fail',
        message: 'Documents bucket not found',
        details: { availableBuckets: buckets?.map(b => b.name) },
        fix: 'Create a bucket named "documents" in Supabase Dashboard → Storage'
      });
      overallStatus = 'fail';
    } else {
      const { data, error } = await supabase.storage
        .from('documents')
        .list('', { limit: 1 });

      results.push({
        name: '3. Supabase Storage',
        status: error ? 'warning' : 'pass',
        message: error 
          ? 'Bucket exists but access may be restricted' 
          : 'Storage bucket configured correctly',
        details: { bucket: 'documents', accessible: !error },
        fix: error ? 'Check bucket policies in Supabase Dashboard → Storage → documents → Policies' : undefined
      });

      if (error) overallStatus = 'fail';
    }
  } catch (error: any) {
    results.push({
      name: '3. Supabase Storage',
      status: 'fail',
      message: 'Failed to check storage configuration',
      details: error.message,
      fix: 'Verify Supabase configuration and storage setup'
    });
    overallStatus = 'fail';
  }

  // Test 4: Gemini API
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    const startTime = Date.now();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'Respond with only: OK'
    });
    
    const text = response.text?.trim();
    const duration = Date.now() - startTime;

    const isValid = text?.toLowerCase().includes('ok');

    results.push({
      name: '4. Gemini API',
      status: isValid ? 'pass' : 'warning',
      message: isValid 
        ? 'Gemini API responding correctly' 
        : 'Gemini API connected but response unexpected',
      details: {
        model: 'gemini-3-flash-preview',
        responseTime: `${duration}ms`,
        response: text?.substring(0, 50),
      }
    });
  } catch (error: any) {
    let fix = 'Add API_KEY to Vercel environment variables';
    
    if (error.message?.includes('API_KEY_INVALID')) {
      fix = 'Invalid API key. Check your AI Studio settings.';
    } else if (error.message?.includes('quota')) {
      fix = 'API quota exceeded. Check usage in your Google Cloud Console.';
    }

    results.push({
      name: '4. Gemini API',
      status: 'fail',
      message: 'Gemini API connection failed',
      details: error.message,
      fix
    });
    overallStatus = 'fail';
  }

  // Test 5: RLS Policies Check
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .limit(1);

    if (!error) {
      results.push({
        name: '5. Row Level Security (RLS)',
        status: 'warning',
        message: 'Query succeeded - RLS may not be fully restrictive or your account has access',
        details: { rlsEnabled: 'Access verified' }
      });
    } else {
      results.push({
        name: '5. Row Level Security (RLS)',
        status: 'pass',
        message: 'RLS is active and enforcing access control',
        details: { rlsEnabled: true }
      });
    }
  } catch (error: any) {
    results.push({
      name: '5. Row Level Security (RLS)',
      status: 'warning',
      message: 'Could not check RLS configuration',
      details: error.message
    });
  }

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warning').length;

  return NextResponse.json({
    summary: {
      overall: overallStatus,
      passed,
      failed,
      warnings,
      total: results.length,
      timestamp: new Date().toISOString(),
      readyForProduction: overallStatus === 'pass' && failed === 0
    },
    tests: results,
    recommendations: generateRecommendations(results)
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    }
  });
}

function generateRecommendations(results: TestResult[]): string[] {
  const recommendations: string[] = [];
  const failedTests = results.filter(r => r.status === 'fail');
  const warningTests = results.filter(r => r.status === 'warning');

  if (failedTests.length === 0 && warningTests.length === 0) {
    recommendations.push('✅ Your app is production-ready!');
    recommendations.push('🚀 All systems are operational');
    return recommendations;
  }

  if (failedTests.length > 0) {
    recommendations.push('🚨 CRITICAL: Fix failed tests before launching');
    failedTests.forEach(test => {
      if (test.fix) recommendations.push(`   - ${test.name}: ${test.fix}`);
    });
  }

  if (warningTests.length > 0) {
    recommendations.push('⚠️  Address warnings for optimal performance');
    warningTests.forEach(test => {
      if (test.fix) recommendations.push(`   - ${test.name}: ${test.fix}`);
    });
  }

  return recommendations;
}