import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * WORLD-CLASS TUTOR CHAT ENGINE (v14.0)
 * Uses unified RAG router for absolute context consistency.
 * Corrected import from 'next/server' to fix build error.
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

    // Fetch the active brain to get latest pedagogical instructions
    const { data: brainData } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Use unified synthesizer for consistency across Chat and Tools
    const { text, provider, metadata } = await generateAIResponse(
      message,
      history,
      user.id,
      supabase,
      "", // No extra adaptive context needed for standard chat
      undefined,
      undefined,
      brainData?.master_prompt,
      priorityDocumentId
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        if (metadata?.isGrounded) {
          controller.enqueue(encoder.encode(`> *🛡️ Neural Sync: Context locked to Authoritative Vault (${metadata.chunksUsed} nodes active). Generating aligned response...*\n\n`));
        } else {
          controller.enqueue(encoder.encode(`> *⚡ Neural Note: No matching curriculum nodes found in your library. Synthesizing using Global Pedagogical Standards...*\n\n`));
        }
        
        controller.enqueue(encoder.encode(text));
        
        if (metadata?.isGrounded && metadata.sources.length > 0) {
          const refs = `\n\n---\n**Grounding Profile:**\n` + 
            metadata.sources.slice(0, 3).map((s: any) => `* Standard: **${s.sloCodes?.[0] || 'Curriculum'}** (Relevance: ${(s.similarity * 100).toFixed(0)}%)`).join('\n');
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