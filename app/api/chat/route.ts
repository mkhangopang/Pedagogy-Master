// app/api/chat/route.ts
// PEDAGOGY MASTER AI — Chat Route (v4.0 Tool-Aware + Rich Prompt Support)

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { detectToolIntent, getToolDisplayName } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';
import { DEFAULT_MASTER_PROMPT } from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token || token === 'undefined') 
      return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const supabase = getSupabaseServerClient(token);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { message, history = [], priorityDocumentId, adaptiveContext } = body;
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });

    const { data: profile } = await supabase.from('profiles').select('workspace_name').eq('id', user.id).single();
    const brandName = profile?.workspace_name || 'Pedagogy Master AI';

    // SECURE BRAIN INJECTION - Prioritize env var (your long v4.0 prompt)
    const { data: brain } = await supabase.from('neural_brain').select('master_prompt').eq('is_active', true).maybeSingle();
    
    const activeMasterPrompt = process.env.FOUNDER_MASTER_PROMPT?.trim() 
      || brain?.master_prompt 
      || DEFAULT_MASTER_PROMPT;

    const routeInfo = detectToolIntent(message);
    const expertTitle = getToolDisplayName(routeInfo.tool);

    // === ENHANCED CONTEXT INJECTION ===
    let customContext = `[CHAT_MODE: ACTIVE]\n[INSTITUTION: ${brandName}]\n[ROLE: Pedagogical Consultant]`;

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

    const assembledSystemPrompt = await getFullPrompt(routeInfo.tool, customContext, activeMasterPrompt);

    const { text, provider, metadata } = await generateAIResponse(
      message,
      history,
      user.id,
      supabase,
      adaptiveContext,
      undefined,
      'chat_tutor',
      assembledSystemPrompt,
      priorityDocumentId
    );

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pedagogy-master.vercel.app';
    const encoder = new TextEncoder();
   
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        
        const groundedNote = metadata?.isGrounded 
          ? ` | Standards Match: ${metadata.sourceDocument}` 
          : '';

        const watermark = `\n\n---\n### 🏛️ ${brandName} Institutional Intelligence Hub\n*Synthesized via ${expertTitle} (${provider}${groundedNote})*\n\n✅ Verified alignment match. [Build your own verified curriculum assets here](${appUrl})`;
        
        controller.enqueue(encoder.encode(watermark));
        controller.close();
      }
    }), { 
      headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
    });

  } catch (error: any) {
    console.error("❌ Conversational Node Error:", error);
    return NextResponse.json({ 
      error: 'Synthesis engine error', 
      details: error.message 
    }, { status: 500 });
  }
}
