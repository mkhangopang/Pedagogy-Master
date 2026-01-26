import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * UNIFIED SYNTHESIS GATEWAY (v39.0)
 * Optimized for Multi-Provider Resilience.
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
    
    // Unified Routing: All tasks (including Visual Aids) now benefit from the Multi-Provider Grid
    const promptText = message || userInput || body.message;
    const effectiveTool = toolType || (task === 'generate-visual' ? 'visual-aid' : undefined);

    const { text, provider, metadata } = await generateAIResponse(
      promptText,
      history || [],
      user.id,
      supabase,
      adaptiveContext,
      undefined,
      effectiveTool,
      brain?.masterPrompt,
      priorityDocumentId
    );

    // Stream Response
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        
        const groundedNote = metadata?.isGrounded ? ` | Intelligence anchored to: ${metadata.sourceDocument}` : '';
        const sourceMeta = metadata?.sources ? `\n\n### 🌐 Research Nodes Found:\n${metadata.sources.map((s: any) => `- [${s.title}](${s.uri})`).join('\n')}` : '';
        
        const footer = `${sourceMeta}\n\n---\n*Synthesis Node: ${provider}${groundedNote} | Grid Status: Resilient*`;
        controller.enqueue(encoder.encode(footer));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [Unified AI Route Error]:", error);
    const isRateLimit = error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('saturated');
    
    return NextResponse.json({ 
      error: isRateLimit ? "Neural Grid Saturated" : error.message || "Synthesis grid exception." 
    }, { status: isRateLimit ? 429 : 500 });
  }
}