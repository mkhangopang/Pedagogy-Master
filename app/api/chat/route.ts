import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * WORLD-CLASS TUTOR CHAT ENGINE (v15.0)
 * FIX: Enforces grounding check and provides explicit retrieval feedback.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { message, priorityDocumentId, history = [] } = body;

    const supabase = getSupabaseServerClient(token);

    // 1. Verify existence of active/indexed curriculum to guide the synthesizer
    const { data: activeDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_selected', true)
      .eq('rag_indexed', true)
      .limit(1)
      .maybeSingle();

    // 2. Fetch the active brain
    const { data: brainData } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Execute Unified Synthesis
    const { text, provider, metadata } = await generateAIResponse(
      message,
      history,
      user.id,
      supabase,
      "", 
      undefined,
      undefined,
      brainData?.master_prompt,
      priorityDocumentId || activeDoc?.id
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        // ENHANCED: Clear UI messaging regarding retrieval success
        if (metadata?.isGrounded) {
          controller.enqueue(encoder.encode(`> *🛡️ Neural Sync: Context locked to Authoritative Vault (${metadata.chunksUsed} nodes active). Generating aligned response...*\n\n`));
        } else {
          controller.enqueue(encoder.encode(`> *⚡ Neural Note: No matching curriculum nodes found in your library for this specific query. Synthesizing using Global Pedagogical Standards...*\n\n`));
        }
        
        controller.enqueue(encoder.encode(text));
        
        if (metadata?.isGrounded && metadata.sources?.length > 0) {
          const topSources = metadata.sources.slice(0, 3);
          const refs = `\n\n---\n**Grounding Profile:**\n` + 
            topSources.map((s: any) => `* Standard: **${s.sloCodes?.[0] || 'Curriculum'}** (Match: ${(s.similarity * 100).toFixed(0)}%)`).join('\n');
          controller.enqueue(encoder.encode(refs));
        }
        
        controller.enqueue(encoder.encode(`\n\n*Synthesis Node: ${provider}*`));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [CHAT ROUTE ERROR]:", error);
    return new Response(`AI Alert: Synthesis grid encountered a bottleneck. (Error: ${error.message})`, { status: 200 });
  }
}
