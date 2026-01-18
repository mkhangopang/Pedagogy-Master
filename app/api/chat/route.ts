
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { DEFAULT_MASTER_PROMPT } from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * UNIFIED CHAT ENGINE (v27.0)
 * Enforces strict grounding via the orchestrator layer.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

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

    const supabase = getSupabaseServerClient(token);

    const { text, provider, metadata } = await generateAIResponse(
      message,
      history,
      user.id,
      supabase,
      adaptiveContext,
      undefined,
      'chat_tutor',
      DEFAULT_MASTER_PROMPT,
      priorityDocumentId
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        // Only stream the text. The orchestrator now includes context warnings in the text body if needed.
        controller.enqueue(encoder.encode(text));
        
        // Detailed synthesis footer
        const footer = `\n\n---\n*Synthesis Node: ${provider}${metadata?.isGrounded ? ` | Intelligence anchored to: ${metadata.sourceDocument}` : ''}*`;
        controller.enqueue(encoder.encode(footer));
        
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ Unified Chat API Error:", error);
    return new Response(JSON.stringify({ 
      error: 'Synthesis node error',
      details: error.message 
    }), { status: 500 });
  }
}
