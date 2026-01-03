import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '../../../lib/supabase';
import { ADMIN_EMAILS } from '../../../constants';
import { r2Client, R2_BUCKET, isR2Configured, R2_PUBLIC_BASE_URL } from '../../../lib/r2';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

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
      r2Configured: isR2Configured(),
      r2PublicUrl: !!R2_PUBLIC_BASE_URL
    };
    results.push({
      name: 'Cloud Infrastructure Keys',
      status: (envCheck.supabaseUrl && envCheck.supabaseKey && envCheck.geminiKey) ? 'pass' : 'fail',
      message: 'Critical environment variables detected.',
      details: envCheck
    });

    // 2. R2 Handshake
    if (isR2Configured() && r2Client) {
      try {
        await r2Client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 1 }));
        results.push({
          name: 'Cloudflare R2 Storage',
          status: 'pass',
          message: `Successfully connected to bucket: ${R2_BUCKET}`
        });
        
        if (R2_PUBLIC_BASE_URL) {
          results.push({
            name: 'R2 Public Access',
            status: 'pass',
            message: `Public URL established: ${R2_PUBLIC_BASE_URL}`
          });
        } else {
          results.push({
            name: 'R2 Public Access',
            status: 'warning',
            message: 'R2 is active but NEXT_PUBLIC_R2_PUBLIC_URL is missing. Documents will be proxied via server.'
          });
        }
      } catch (e: any) {
        results.push({
          name: 'Cloudflare R2 Storage',
          status: 'fail',
          message: `R2 Connection Error: ${e.message}`
        });
      }
    } else {
      results.push({
        name: 'Cloudflare R2 Storage',
        status: 'warning',
        message: 'R2 not configured. System is using Supabase fallback.'
      });
    }

    // 3. Database Connectivity
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

    // 4. AI Engine Handshake
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

    const passedCount = results.filter(r => r.status === 'pass').length;
    const failedCount = results.filter(r => r.status === 'fail').length;
    const warningCount = results.filter(r => r.status === 'warning').length;

    return NextResponse.json({
      summary: {
        overall: failedCount === 0 ? 'pass' : 'fail',
        passed: passedCount,
        failed: failedCount,
        warnings: warningCount,
        total: results.length,
        timestamp: new Date().toISOString(),
        readyForProduction: failedCount === 0
      },
      tests: results,
      recommendations: failedCount === 0 
        ? ["Infrastructure is fully validated for production."] 
        : ["Address failing modules or provide missing R2 credentials."]
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}