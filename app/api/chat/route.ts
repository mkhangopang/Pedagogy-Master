
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { detectToolIntent, getToolDisplayName } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * CONVERSATIONAL SYNTHESIS NODE (v29.0)
 * Protocol: Chat -> Intent Detection -> Tool-Specialized Synthesis
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token || token === 'undefined') return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const supabase = getSupabaseServerClient(token);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { message, history = [], priorityDocumentId, adaptiveContext } = body;
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });

    const { data: profile } = await supabase.from('profiles').select('workspace_name').eq('id', user.id).single();
    const brandName = profile?.workspace_name || 'Pedagogy Master AI';

    // Conversational Intent Detection
    const routeInfo = detectToolIntent(message);
    const expertTitle = getToolDisplayName(routeInfo.tool);
    const customContext = `[CHAT_MODE: ACTIVE]\n[INSTITUTION: ${brandName}]\n[ROLE: Pedagogical Consultant]`;
    const assembledSystemPrompt = await getFullPrompt(routeInfo.tool, customContext);

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
        
        const groundedNote = metadata?.isGrounded ? ` | Standards Match: ${metadata.sourceDocument}` : '';
        const watermark = `\n\n---\n### 🏛️ ${brandName} Institutional Intelligence Hub\n*Synthesized via ${expertTitle} (${provider}${groundedNote})*\n\n✅ Verified alignment match. [Build your own verified curriculum assets here](${appUrl})`;
        
        controller.enqueue(encoder.encode(watermark));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ Conversational Node Error:", error);
    return NextResponse.json({ error: 'Synthesis engine error', details: error.message }, { status: 500 });
  }
}
