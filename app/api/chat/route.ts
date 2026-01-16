import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * PEDAGOGY MASTER CHAT ENGINE (v21.0)
 * Thin orchestrator for the high-precision synthesis grid.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { message, toolType, history = [], priorityDocumentId } = body;

    const supabase = getSupabaseServerClient(token);

    // Delegate all retrieval and prompt construction to the Multi-Provider Router
    // This prevents double-nested templates that trigger model refusal/safety blocks.
    const { text, provider, metadata } = await generateAIResponse(
      message,
      history,
      user.id,
      supabase,
      "", // Adaptive context handled inside router if needed
      undefined,
      toolType,
      undefined, // Uses default Master Prompt from Brain
      priorityDocumentId
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        if (metadata?.isGrounded) {
          controller.enqueue(encoder.encode(`> *🛡️ Neural Sync: Grounded in ${metadata.chunksUsed} curriculum nodes. Synthesis active via ${provider}...*\n\n`));
        }
        controller.enqueue(encoder.encode(text));
        controller.enqueue(encoder.encode(`\n\n*Synthesis Node: ${provider}*`));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ Chat API Fatal Error:", error);
    return new Response(`Synthesis error: The neural node returned an empty response. This usually occurs when the curriculum context is too large or triggers safety filters.`, { status: 200 });
  }
}