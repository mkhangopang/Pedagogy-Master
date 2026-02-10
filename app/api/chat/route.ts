
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { DEFAULT_MASTER_PROMPT } from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * UNIFIED CHAT ENGINE (v28.0 - VIRAL & INSTITUTIONAL)
 * Feature: Auto-Branding & Viral Watermarking
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token || token === 'undefined') {
      return NextResponse.json({ error: 'Auth Required' }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });
    }

    const body = await req.json();
    const { 
      message, 
      history = [], 
      priorityDocumentId,
      adaptiveContext 
    } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const authenticatedSupabase = getSupabaseServerClient(token);
    const { data: profile } = await authenticatedSupabase.from('profiles').select('workspace_name').eq('id', user.id).single();
    const brandName = profile?.workspace_name || 'EduNexus AI';

    const { text, provider, metadata } = await generateAIResponse(
      message,
      history,
      user.id,
      authenticatedSupabase,
      adaptiveContext,
      undefined,
      'chat_tutor',
      `${DEFAULT_MASTER_PROMPT}\n[INSTITUTION_ID: ${brandName}]`,
      priorityDocumentId
    );

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pedagogy-master.vercel.app';
    const encoder = new TextEncoder();
    
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        
        // 🚀 VIRAL PEDAGOGICAL WATERMARK
        const groundedNote = metadata?.isGrounded ? ` | Standards anchored to: ${metadata.sourceDocument}` : '';
        const watermark = `\n\n---\n### 🏛️ ${brandName} Institutional Intelligence Hub\n*Synthesized via EduNexus AI Grid (${provider}${groundedNote})*\n\n✅ Verified alignment match. [Build your own verified curriculum assets here](${appUrl})`;
        
        controller.enqueue(encoder.encode(watermark));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ Unified Chat API Error:", error);
    return NextResponse.json({ 
      error: 'Synthesis engine error',
      details: error.message 
    }, { status: 500 });
  }
}
