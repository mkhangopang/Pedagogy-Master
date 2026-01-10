
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Extended for deep curriculum analysis

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { task, message, adaptiveContext, history, toolType, userInput } = body;
    
    const supabase = getSupabaseServerClient(token);
    
    // Determine the prompt based on task type
    const promptText = task === 'generate-tool' 
      ? `GENERATE_${toolType.toUpperCase().replace('-', '_')}: ${userInput}`
      : message;

    // generateAIResponse now internally handles fetching all selected docs for the user
    const { text, provider } = await generateAIResponse(
      promptText, 
      history || [], 
      user.id, 
      supabase,
      adaptiveContext, 
      undefined, // Router now fetches docParts directly from R2/Supabase
      toolType
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.enqueue(encoder.encode(`\n\n---\n*Synthesis Node: ${provider}*`));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("AI ROUTE ERROR:", error);
    return NextResponse.json({ 
      error: error.message || "Synthesis grid encountered a fatal exception." 
    }, { status: 500 });
  }
}
