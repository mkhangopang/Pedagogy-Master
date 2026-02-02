import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * UNIFIED SYNTHESIS GATEWAY (v45.0)
 * Optimized for High-Latency Curriculum Processing and Edge Reliability.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { task, toolType, userInput, brain, priorityDocumentId, message, adaptiveContext, history } = body;
    
    const supabase = getSupabaseServerClient(token);
    const promptText = message || userInput || body.message;

    // Direct Orchestration Call
    const { text, provider, metadata } = await generateAIResponse(
      promptText,
      history || [],
      user.id,
      supabase,
      adaptiveContext,
      undefined,
      toolType,
      brain?.masterPrompt,
      priorityDocumentId
    );

    // Synthesis Result Packaging
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        
        // Dynamic Footer Construction for User Trust
        const groundedNote = metadata?.activeMode === 'VAULT' ? ` | 🏛️ Anchored to ${metadata.sourceDocument}` : ' | 🌐 Global Knowledge';
        const verificationBadge = metadata?.verbatimVerified ? ' | ✅ Verbatim Standard Verified' : '';
        const footer = `\n\n---\n*Synthesis Node: ${provider}${groundedNote}${verificationBadge} | v4.0 Ultra-Deterministic Architecture*`;
        
        controller.enqueue(encoder.encode(footer));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [AI Gateway Error]:", error);
    const isRateLimit = error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('saturated');
    
    return NextResponse.json({ 
      error: isRateLimit ? "Neural Grid Saturated: Please retry in 15 seconds." : error.message || "Synthesis grid exception." 
    }, { status: isRateLimit ? 429 : 500 });
  }
}