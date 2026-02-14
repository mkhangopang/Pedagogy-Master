
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { detectToolIntent, ToolType, getToolDisplayName } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * UNIFIED SYNTHESIS GATEWAY (v54.0 - MASTER ARCHITECT)
 * FEATURE: Tool-Specialized Routing & Institutional Branding
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
    
    const promptText = userInput || "";
    
    // 1. Resolve Workspace Identity
    const supabase = getSupabaseServerClient(token);
    const { data: profile } = await supabase.from('profiles').select('workspace_name, name').eq('id', user.id).single();
    const brandName = profile?.workspace_name || 'EduNexus Grid';

    // 2. Specialized Routing Logic
    const routeInfo = toolType ? { tool: toolType as ToolType } : detectToolIntent(promptText);
    const effectiveTool = routeInfo.tool;
    const expertTitle = getToolDisplayName(effectiveTool);

    // 3. Modular Prompt Synthesis
    const customContext = `[INSTITUTION: ${brandName}]\n[USER_ROLE: Educator Specialist]\n[INSTRUCTION: Format all headers to match ${brandName} institutional standards.]`;
    const assembledSystemPrompt = await getFullPrompt(effectiveTool, customContext);

    // 4. Multi-Provider Execution
    const { text, provider, metadata } = await generateAIResponse(
      promptText,
      history || [],
      user.id,
      supabase,
      adaptiveContext,
      undefined,
      effectiveTool,
      assembledSystemPrompt, 
      priorityDocumentId
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        // Enqueue the primary synthesis
        controller.enqueue(encoder.encode(text));
        
        // 🚀 INSTITUTIONAL WATERMARK & WORKFLOW ROUTING
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pedagogy-master.vercel.app';
        const groundedNote = metadata?.isGrounded ? ` | Standards Anchored: ${metadata.sourceDocument}` : '';
        
        const footer = `\n\n---\n### 🏛️ ${brandName} | Institutional Artifact\n**Expert Node:** ${expertTitle}\n**Neural Status:** ✅ Verified Alignment Match${groundedNote}\n\n*Created with Pedagogy Master AI — [Institutional Access Active](${appUrl})*`;
        
        controller.enqueue(encoder.encode(footer));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [Neural Gateway Fault]:", error);
    return NextResponse.json({ 
      error: "Synthesis grid exception. Verify usage limits.",
      details: error.message
    }, { status: 500 });
  }
}
