import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '../../../lib/supabase';
import { ADMIN_EMAILS } from '../../../constants';
import { r2Client, BUCKET_NAME } from '../../../lib/r2';
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

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
      r2Endpoint: !!process.env.R2_ENDPOINT,
      r2AccessKey: !!process.env.R2_ACCESS_KEY_ID,
      r2Secret: !!process.env.R2_SECRET_ACCESS_KEY,
    };

    const allPresent = Object.values(envCheck).every(v => v === true);

    results.push({
      name: '1. Environment Variables',
      status: allPresent ? 'pass' : 'fail',
      message: allPresent 
        ? 'All required environment variables (Supabase, Gemini, R2) are set' 
        : 'Missing required environment variables',
      details: envCheck,
      fix: !allPresent ? 'Add missing variables in Vercel Dashboard → Settings → Environment Variables' : undefined
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
      fix: 'Verify Supabase URL and key. Run SQL Patch v60 if documents table is missing.'
    });
    overallStatus = 'fail';
  }

  // Test 3: Cloudflare R2 Connectivity
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 1,
    });
    const response = await r2Client.send(command);

    results.push({
      name: '3. Cloudflare R2 Storage',
      status: 'pass',
      message: 'Successfully connected to R2 bucket',
      details: { bucket: BUCKET_NAME, metadata: response.$metadata }
    });
  } catch (error: any) {
    results.push({
      name: '3. Cloudflare R2 Storage',
      status: 'fail',
      message: 'Failed to connect to R2 bucket',
      details: error.message,
      fix: 'Verify R2 credentials and endpoint. Ensure CORS is configured for your domain on R2.'
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
      name: '4. Gemini AI Engine',
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
    results.push({
      name: '4. Gemini AI Engine',
      status: 'fail',
      message: 'Gemini API connection failed',
      details: error.message,
      fix: 'Check API_KEY validity and quota in Google AI Studio'
    });
    overallStatus = 'fail';
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
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}

function generateRecommendations(results: TestResult[]): string[] {
  const recommendations: string[] = [];
  const failedTests = results.filter(r => r.status === 'fail');

  if (failedTests.length === 0) {
    recommendations.push('✅ System architecture is validated.');
    recommendations.push('🚀 R2 Storage and Gemini AI are fully integrated.');
    return recommendations;
  }

  failedTests.forEach(test => {
    if (test.fix) recommendations.push(`🚨 Fix ${test.name}: ${test.fix}`);
  });

  return recommendations;
}
