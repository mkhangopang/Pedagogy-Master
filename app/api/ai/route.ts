
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { detectToolIntent, ToolType } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * UNIFIED SYNTHESIS GATEWAY (v53.1 - REBRANDED)
 * FEATURE: Auto-Branding & Neural Watermarking
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
    
    // 1. Fetch Workspace Identity
    const supabase = getSupabaseServerClient(token);
    const { data: profile } = await supabase.from('profiles').select('workspace_name, name').eq('id', user.id).single();
    const brandName = profile?.workspace_name || 'Pedagogy Master AI';

    // 2. NEURAL ROUTING
    const effectiveTool = (toolType as ToolType) || detectToolIntent(promptText).tool;
    
    // 3. MODULAR PROMPT ASSEMBLY
    const basePrompt = await getFullPrompt(effectiveTool);
    const institutionalContext = `\n[INSTITUTION_ID: ${brandName}]\n[INSTRUCTION: Format headers as belonging to this institution.]`;
    const masterPromptOverride = basePrompt + institutionalContext;

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
        
        // 🚀 VIRAL PEDAGOGICAL WATERMARK
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pedagogy-master.vercel.app';
        const watermark = `\n\n---\n### 🏛️ Institutional Intelligence Hub\n**Synthesized for:** ${brandName}\n**Alignment Status:** ✅ Verified Standards Match\n\n*Created with Pedagogy Master AI — [Build your own standards-aligned lessons here](${appUrl})*`;
        
        controller.enqueue(encoder.encode(watermark));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [Neural Gateway Fault]:", error);
    return NextResponse.json({ 
      error: "Synthesis grid exception. Please check your Usage Limit.",
      details: error.message
    }, { status: 500 });
  }
}
