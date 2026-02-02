import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * UNIFIED SYNTHESIS GATEWAY (v47.0)
 * Signature: v4.0 Ultra-Deterministic Architecture.
 * FIX: Enhanced Error Propagation to bypass generic gateway faults.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { toolType, userInput, brain, priorityDocumentId, message, adaptiveContext, history } = body;
    
    const supabase = getSupabaseServerClient(token);
    const promptText = message || userInput || body.message;

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

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        
        // Final Signature Alignment
        const groundedNote = metadata?.isGrounded 
          ? ` | 🏛️ Anchored to Master MD: ${metadata.sourceDocument}` 
          : ' | 🌐 Global Knowledge Node';
        
        const footer = `\n\n---\n*Synthesis Node: ${provider}${groundedNote} | v4.0 Ultra-Deterministic Architecture*`;
        
        controller.enqueue(encoder.encode(footer));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [AI Gateway Error]:", error);
    // Propagate the specific grid error if available
    const errorMsg = error.message?.includes('GRID_FAULT') || error.message?.includes('NEURAL_GRID')
      ? error.message 
      : "Synthesis grid exception: The neural nodes are currently re-aligning. Please retry.";
      
    return NextResponse.json({ 
      error: errorMsg,
      status: 'failed' 
    }, { status: 500 });
  }
}