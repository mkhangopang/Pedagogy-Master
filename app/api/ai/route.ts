
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';

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
    const { 
      task, 
      message, 
      adaptiveContext, 
      history, 
      toolType, 
      userInput, 
      brain,
      priorityDocumentId 
    } = body;
    
    const supabase = getSupabaseServerClient(token);

    // High-fidelity prompt engineering for Tools
    let promptText = message;
    if (task === 'generate-tool') {
      promptText = `COMMAND: Generate a high-fidelity ${toolType?.replace('-', ' ')}.\n\n` +
                   `INPUT PARAMETERS: ${userInput}\n\n` +
                   `CRITICAL: Locate the most relevant Standard or SLO in the vault matching this input and anchor all synthesis to it.`;
    }

    const customSystem = brain?.masterPrompt;

    const { text, provider, metadata } = await generateAIResponse(
      promptText, 
      history || [], 
      user.id, 
      supabase,
      adaptiveContext, 
      undefined, 
      toolType,
      customSystem,
      priorityDocumentId 
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        
        const groundedNote = metadata?.isGrounded 
          ? ` | intelligence anchored to: ${metadata.sourceDocument}` 
          : '';
        
        const footer = `\n\n---\n*Synthesis Node: ${provider}${groundedNote}*`;
        controller.enqueue(encoder.encode(footer));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [AI ROUTE ERROR]:", error);
    return NextResponse.json({ 
      error: error.message || "Synthesis grid encountered a fatal exception." 
    }, { status: 500 });
  }
}
