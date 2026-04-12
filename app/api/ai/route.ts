// app/api/ai/route.ts
// PEDAGOGY MASTER AI — Main Synthesis Route (v4.0 Tool-Aware)

import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { detectToolIntent, ToolType, getToolDisplayName } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';
import { DEFAULT_MASTER_PROMPT } from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { toolType, userInput, priorityDocumentId, adaptiveContext, history } = body;

    const supabase = getSupabaseServerClient(token);
    const { data: profile } = await supabase.from('profiles').select('workspace_name, name').eq('id', user.id).single();
    const brandName = profile?.workspace_name || 'Pedagogy Master AI';

    // SECURE BRAIN INJECTION - Prioritize env var then DB
    const { data: brain } = await supabase.from('neural_brain').select('master_prompt').eq('is_active', true).maybeSingle();
    
    const activeMasterPrompt = process.env.FOUNDER_MASTER_PROMPT?.trim() 
      || brain?.master_prompt 
      || DEFAULT_MASTER_PROMPT;

    const routeInfo = toolType ? { tool: toolType as ToolType } : detectToolIntent(userInput || "");
    const effectiveTool = routeInfo.tool;
    const expertTitle = getToolDisplayName(effectiveTool);

    // === ENHANCED CONTEXT INJECTION ===
    let customContext = `[INSTITUTION: ${brandName}]\n[INSTRUCTION: Format headers for ${brandName} standards.]\n[SPECIALIST: ${expertTitle}]`;

    if (adaptiveContext) {
      customContext += `\n[VAULT CONTEXT]`;
      if (adaptiveContext.board) customContext += `\nBoard: ${adaptiveContext.board}`;
      if (adaptiveContext.subject) customContext += `\nSubject: ${adaptiveContext.subject}`;
      if (adaptiveContext.gradeLevel) customContext += `\nGrade Level: ${adaptiveContext.gradeLevel}`;
      
      if (adaptiveContext.selectedSLOs && adaptiveContext.selectedSLOs.length > 0) {
        customContext += `\n[SELECTED SLOs FROM VAULT]\n${adaptiveContext.selectedSLOs.map((s: any) => 
          `${s.slo_code}: ${s.slo_full_text} (Bloom: ${s.bloom_level || 'Remember'})`
        ).join('\n')}`;
      }
    }

    const systemPrompt = await getFullPrompt(effectiveTool, customContext, activeMasterPrompt);

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
        
        const groundedNote = metadata?.isGrounded 
          ? ` | Standards Anchored: ${metadata.sourceDocument}` 
          : '';

        const footer = `\n\n---\n### 🏛️ ${brandName} | Institutional Artifact\n**Expert Node:** ${expertTitle}\n**Neural Status:** ✅ Verified Alignment${groundedNote}`;
        
        controller.enqueue(encoder.encode(footer));
        controller.close();
      }
    }), { 
      headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
    });

  } catch (error: any) {
    console.error("❌ [Synthesis Fault]:", error);
    return NextResponse.json({
      error: "Synthesis grid exception. Verify usage limits.",
      details: error.message
    }, { status: 500 });
  }
}
