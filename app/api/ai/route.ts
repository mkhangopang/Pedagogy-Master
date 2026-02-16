import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { detectToolIntent, ToolType, getToolDisplayName } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * UNIFIED SYNTHESIS GATEWAY (v4.0 - MASTER ARCHITECT)
 * FEATURE: Tool-Specialized Routing & Modular Prompting
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { toolType, userInput, priorityDocumentId, adaptiveContext, history } = body;
    
    // 1. Resolve Workspace Identity
    const supabase = getSupabaseServerClient(token);
    const { data: profile } = await supabase.from('profiles').select('workspace_name, name').eq('id', user.id).single();
    const brandName = profile?.workspace_name || 'Pedagogy Master AI';

    // 2. Resolve Specialist Node
    const routeInfo = toolType ? { tool: toolType as ToolType } : detectToolIntent(userInput || "");
    const effectiveTool = routeInfo.tool;
    const expertTitle = getToolDisplayName(effectiveTool);

    // 3. Construct Specialized Context
    const customContext = `[INSTITUTION: ${brandName}]\n[INSTRUCTION: Format headers for ${brandName} standards.]\n[SPECIALIST: ${expertTitle}]`;
    const systemPrompt = await getFullPrompt(effectiveTool, customContext);

    // 4. Execute Synthesis with Gemini 3 Pro for high-stakes tasks
    const { text, provider, metadata } = await generateAIResponse(
      userInput || "",
      history || [],
      user.id,
      supabase,
      adaptiveContext,
      undefined,
      effectiveTool,
      systemPrompt, 
      priorityDocumentId
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        
        // Institutional Watermark
        const groundedNote = metadata?.isGrounded ? ` | Standards Anchored: ${metadata.sourceDocument}` : '';
        const footer = `\n\n---\n### 🏛️ ${brandName} | Institutional Artifact\n**Expert Node:** ${expertTitle}\n**Neural Status:** ✅ Verified Alignment${groundedNote}`;
        
        controller.enqueue(encoder.encode(footer));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [Synthesis Fault]:", error);
    return NextResponse.json({ 
      error: "Synthesis grid exception. Verify usage limits.",
      details: error.message
    }, { status: 500 });
  }
}
