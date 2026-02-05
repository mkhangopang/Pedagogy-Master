
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { detectToolIntent, ToolType } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * UNIFIED SYNTHESIS GATEWAY (v52.0 - TOOL SPECIALIZED)
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
    
    const promptText = message || userInput || "";
    
    // 1. NEURAL ROUTING
    // If toolType is not provided (General Chat), detect it.
    const effectiveTool = (toolType as ToolType) || detectToolIntent(promptText).tool;
    
    // 2. MODULAR PROMPT ASSEMBLY
    const masterPromptOverride = await getFullPrompt(effectiveTool);

    const supabase = getSupabaseServerClient(token);
    const { text, provider, metadata } = await generateAIResponse(
      promptText,
      history || [],
      user.id,
      supabase,
      adaptiveContext,
      undefined,
      effectiveTool,
      masterPromptOverride, 
      priorityDocumentId
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        
        const groundedNote = metadata?.isGrounded 
          ? ` | 🏛️ Anchored: ${metadata.sourceDocument}` 
          : ' | 🌐 Creative Intelligence Node';
        
        const footer = `\n\n---\n*Synthesis Node: ${provider} [Expert: ${effectiveTool}] | Founder-Locked v52.0*`;
        
        controller.enqueue(encoder.encode(footer));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [Neural Gateway Fault]:", error);
    return NextResponse.json({ 
      error: "Synthesis grid exception. Please check your Node Quota.",
      details: error.message
    }, { status: 500 });
  }
}
