import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * UNIFIED SYNTHESIS GATEWAY (v51.0)
 * Signature: Founder-Secured Neural Routing.
 * FEATURE: Server-side Brain Logic Lookup (Zero-Leak Prompting).
 * PRIVACY: Explicitly instruct models not to train on this input.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { toolType, userInput, priorityDocumentId, message, adaptiveContext, history } = body;
    
    const supabase = getSupabaseServerClient(token);
    
    // FETCH SECURE BRAIN PROMPT (Prevents prompt injection/leaks and protects IP)
    const { data: brainData } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const masterPromptOverride = brainData?.master_prompt || "You are a specialized curriculum AI. Strictly follow document grounding.";
    const promptText = message || userInput || body.message;

    const { text, provider, metadata } = await generateAIResponse(
      promptText,
      history || [],
      user.id,
      supabase,
      adaptiveContext,
      undefined,
      toolType,
      masterPromptOverride, 
      priorityDocumentId
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        
        // Institutional Signature
        const groundedNote = metadata?.isGrounded 
          ? ` | 🏛️ Anchored: ${metadata.sourceDocument}` 
          : ' | 🌐 Creative Intelligence Node';
        
        const footer = `\n\n---\n*Synthesis Node: ${provider}${groundedNote} | Founder-Locked Architecture v5.1*`;
        
        controller.enqueue(encoder.encode(footer));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [Founder Grid Alert]:", error);
    return NextResponse.json({ 
      error: "Synthesis grid exception. Please check your Node Quota.",
      details: error.message,
      status: 'failed' 
    }, { status: 500 });
  }
}