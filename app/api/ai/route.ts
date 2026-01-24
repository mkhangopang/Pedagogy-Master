import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { callGemini } from '../../../lib/ai/providers/gemini';

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
    const { task, toolType, userInput, brain, priorityDocumentId, message } = body;
    
    // 1. NEURAL VISUAL NODE (Dedicated Image Synthesis)
    if (task === 'generate-visual' || toolType === 'visual-aid') {
      const { data: profile } = await anonClient.from('profiles').select('plan, role').eq('id', user.id).single();
      
      const role = profile?.role?.toLowerCase() || '';
      const plan = profile?.plan?.toLowerCase() || '';
      
      const isAuthorized = role === 'app_admin' || role === 'enterprise_admin' || plan === 'enterprise' || plan === 'pro';
      
      if (!isAuthorized) {
        return NextResponse.json({ 
          error: "Visual Node Restricted. Access requires a Pro or Enterprise identity node." 
        }, { status: 403 });
      }

      const visualPrompt = `Generate a high-fidelity, professional educational diagram for: ${userInput}. 
      REQUIREMENTS:
      - Clean, labeled structures.
      - Academic pedagogical style (suitable for textbooks).
      - Flat design with high contrast.
      - Grounding Subject: ${toolType}.`;
      
      // Call Gemini with forceImageModel set to true
      const result = await callGemini(visualPrompt, [], "", false, [], true);
      
      if (!result.imageUrl) {
        throw new Error("Neural vision node failed to synthesize pixels.");
      }

      return NextResponse.json({ 
        imageUrl: result.imageUrl,
        content: `![Pedagogical Diagram](${result.imageUrl})\n\n*Synthesis Node: gemini-2.5-flash-image | Logic anchored to instructional visual standards.*`
      });
    }

    // 2. STANDARD TEXT SYNTHESIS (Streaming)
    const supabase = getSupabaseServerClient(token);
    let promptText = message || body.message;
    
    if (task === 'generate-tool') {
      promptText = `COMMAND: Generate a high-fidelity ${toolType?.replace('-', ' ')}.\n\n` +
                   `INPUT PARAMETERS: ${userInput}\n\n` +
                   `CRITICAL: Locate the most relevant Standard or SLO in the vault matching this input and anchor all synthesis to it.`;
    }

    const { text, provider, metadata } = await generateAIResponse(
      promptText, 
      body.history || [], 
      user.id, 
      supabase, 
      body.adaptiveContext, 
      undefined, 
      toolType, 
      brain?.masterPrompt, 
      priorityDocumentId || body.priorityDocumentId
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        const groundedNote = metadata?.isGrounded ? ` | intelligence anchored to: ${metadata.sourceDocument}` : '';
        const footer = `\n\n---\n*Synthesis Node: ${provider}${groundedNote}*`;
        controller.enqueue(encoder.encode(footer));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [AI ROUTE ERROR]:", error);
    return NextResponse.json({ error: error.message || "Synthesis grid exception." }, { status: 500 });
  }
}