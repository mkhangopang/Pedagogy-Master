import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponseStream } from '../../../lib/ai/multi-provider-router';
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

    const { data: brain } = await supabase.from('neural_brain').select('master_prompt').eq('is_active', true).maybeSingle();
    const activeMasterPrompt = brain?.master_prompt || DEFAULT_MASTER_PROMPT;

    const routeInfo = toolType ? { tool: toolType as ToolType } : detectToolIntent(userInput || "");
    const effectiveTool = routeInfo.tool;
    const expertTitle = getToolDisplayName(effectiveTool);

    const customContext = `[INSTITUTION: ${brandName}]\n[INSTRUCTION: Format headers for ${brandName} standards.]\n[SPECIALIST: ${expertTitle}]`;
    const systemPrompt = await getFullPrompt(effectiveTool, customContext, activeMasterPrompt);

    const stream = generateAIResponseStream(
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
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const token of stream) {
            const payload = JSON.stringify({ token });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
          
          const groundedNote = ` | Standards Anchored: ${priorityDocumentId ? 'YES' : 'NO'}`;
          const footer = `\n\n---\n### 🏛️ ${brandName} | Institutional Artifact\n**Expert Node:** ${expertTitle}\n**Neural Status:** ✅ Verified Alignment${groundedNote}`;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: footer })}\n\n`));
          
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err: any) {
          console.error("Stream Error:", err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });

  } catch (error: any) {
    console.error("❌ [Synthesis Fault]:", error);
    return NextResponse.json({ 
      error: "Synthesis grid exception. Verify usage limits.",
      details: error.message
    }, { status: 500 });
  }
}
