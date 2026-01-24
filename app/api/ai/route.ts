import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { callGemini } from '../../../lib/ai/providers/gemini';
import { synthesize } from '../../../lib/ai/synthesizer-core';

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
    
    // 1. NEURAL VISUAL NODE (Hybrid Synthesis)
    if (task === 'generate-visual' || toolType === 'visual-aid') {
      const { data: profile } = await anonClient.from('profiles').select('plan, role').eq('id', user.id).single();
      
      const role = profile?.role?.toLowerCase() || '';
      const plan = profile?.plan?.toLowerCase() || '';
      const isDev = role === 'app_admin';
      const isPro = plan === 'enterprise' || plan === 'pro';
      
      // ADMIN/PRO: High-Fidelity Pixel Synthesis (Gemini 2.5 Flash Image)
      if (isDev || isPro) {
        const visualPrompt = `Generate a high-fidelity, professional pedagogical diagram for: ${userInput}. 
        REQUIREMENTS:
        - Educational textbook style.
        - Clean labels and structures.
        - High contrast, academic palette.`;
        
        const result = await callGemini(visualPrompt, [], "", false, [], true);
        
        if (result.imageUrl) {
          return NextResponse.json({ 
            imageUrl: result.imageUrl,
            content: `![Pedagogical Diagram](${result.imageUrl})\n\n*Synthesis Node: gemini-2.5-flash-image | Logic anchored to instructional visual standards.*`
          });
        }
      }

      // FREE TIER FALLBACK: Neural SVG Synthesis (Groq/SambaNova)
      const svgPrompt = `Create a professional SVG-based pedagogical diagram for: ${userInput}.
      RULES:
      1. Output ONLY the SVG code wrapped in a markdown code block.
      2. Use a clean academic style with readable labels.
      3. Ensure the SVG is responsive (width="100%").
      4. Avoid complex gradients; keep it flat and pedagogical.`;

      const svgResult = await synthesize(svgPrompt, [], false, [], 'groq', 'You are a pedagogical SVG architect.');
      
      return NextResponse.json({
        content: `${svgResult.text}\n\n*Synthesis Node: ${svgResult.provider} (SVG Mode) | Vector visual optimized for classroom display.*`
      });
    }

    // 2. STANDARD TEXT SYNTHESIS (Streaming)
    const supabase = getSupabaseServerClient(token);
    let promptText = message || body.message;
    
    if (task === 'generate-tool') {
      promptText = `COMMAND: Generate a high-fidelity ${toolType?.replace('-', ' ')}.\n\n` +
                   `INPUT PARAMETERS: ${userInput}\n\n` +
                   `CRITICAL: Locate relevant Standard or SLO in vault matching this input.`;
    }

    const { text, provider, metadata } = await generateAIResponse(
      promptText, body.history || [], user.id, supabase, body.adaptiveContext, undefined, toolType, brain?.masterPrompt, priorityDocumentId
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