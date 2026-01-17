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
  fix?: string;
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
    const apiKey = (process.env.API_KEY || '').trim();

    const envCheck = {
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      geminiKey: !!apiKey,
      r2Configured: isR2Configured(),
      r2PublicUrl: !!R2_PUBLIC_BASE_URL
    };

    results.push({
      name: 'Cloud Infrastructure Keys',
      status: (envCheck.supabaseUrl && envCheck.supabaseKey && envCheck.geminiKey) ? 'pass' : 'fail',
      message: envCheck.geminiKey 
        ? 'Critical environment variables detected.' 
        : 'AI API Key missing (Checked process.env.API_KEY).',
      details: envCheck,
      fix: !envCheck.geminiKey ? 'Please add API_KEY to your Vercel Environment Variables.' : undefined
    });

    if (isR2Configured() && r2Client) {
      try {
        await r2Client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 1 }));
        results.push({
          name: 'Cloudflare R2 Storage',
          status: 'pass',
          message: `Successfully connected to bucket: ${R2_BUCKET}`
        });
      } catch (e: any) {
        results.push({
          name: 'Cloudflare R2 Storage',
          status: 'fail',
          message: `R2 Connection Error: ${e.message}`
        });
      }
    }

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

    if (!apiKey) {
      results.push({
        name: 'Gemini AI Synthesis Engine',
        status: 'fail',
        message: 'No valid AI Key found.'
      });
    } else {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: 'Ping connectivity test'
        });
        results.push({
          name: 'Gemini AI Synthesis Engine',
          status: response.text ? 'pass' : 'warning',
          message: 'AI Handshake successful.'
        });
      } catch (e: any) {
        results.push({ name: 'Gemini AI Synthesis Engine', status: 'fail', message: `Engine offline: ${e.message}` });
      }
    }

    return NextResponse.json({
      summary: {
        overall: results.some(r => r.status === 'fail') ? 'fail' : 'pass',
        passed: results.filter(r => r.status === 'pass').length,
        failed: results.filter(r => r.status === 'fail').length,
        warnings: results.filter(r => r.status === 'warning').length,
        total: results.length,
        timestamp: new Date().toISOString(),
        readyForProduction: !results.some(r => r.status === 'fail')
      },
      tests: results
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}