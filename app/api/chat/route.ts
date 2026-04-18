import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
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

    const supabase = getSupabaseServerClient(token);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();

    // FIX BUG 9: We no longer accept or process `doc.base64` on the server.
    // Document content comes exclusively from RAG (Supabase vector search).
    // Removing base64 from the expected payload prevents large requests that
    // can hit Vercel's 4.5 MB body limit and time out.
    const {
      toolType,
      userInput,       // Should be the CLEAN user query — no persona wrapper
      priorityDocumentId,
      adaptiveContext,
      history
    } = body;

    // Guard: userInput must be a clean string
    if (!userInput || typeof userInput !== 'string') {
      return NextResponse.json({ error: 'userInput is required and must be a string' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_name, name')
      .eq('id', user.id)
      .single();
    const brandName = profile?.workspace_name || 'Pedagogy Master AI';

    const { data: brain } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .maybeSingle();
    const activeMasterPrompt = brain?.master_prompt || DEFAULT_MASTER_PROMPT;

    // Tool routing: explicit toolType from client takes priority
    const routeInfo = toolType
      ? { tool: toolType as ToolType }
      : detectToolIntent(userInput);
    const effectiveTool = routeInfo.tool;
    const expertTitle = getToolDisplayName(effectiveTool);

    const customContext = `[INSTITUTION: ${brandName}]\n[SPECIALIST: ${expertTitle}]\n${adaptiveContext || ''}`;
    const systemPrompt = await getFullPrompt(effectiveTool, customContext, activeMasterPrompt);

    // generateAIResponse now:
    //   - includes toolType for doc-required checks
    //   - uses document-aware cache keys (no stale hallucinations)
    //   - builds vault content with explicit grounding instructions
    const { text, provider, metadata } = await generateAIResponse(
      userInput,
      history || [],
      user.id,
      supabase,
      adaptiveContext,
      undefined,        // overrideDocPart: removed, was dead code
      effectiveTool,
      systemPrompt,
      priorityDocumentId
    );

    // Build footer
    const groundedNote = metadata?.isGrounded
      ? ` | Standards Anchored: ${metadata.sourceDocument}`
      : metadata?.blocked
        ? ' | ⚠️ Document Required'
        : ' | General Knowledge Mode';

    const footer = `\n\n---\n### 🏛️ ${brandName} | Institutional Artifact\n**Expert Node:** ${expertTitle} (${provider})\n**Neural Status:** ${metadata?.isGrounded ? '✅ Curriculum Grounded' : '⚠️ General Mode'}${groundedNote}`;

    const fullResponse = text + footer;

    // ── SSE streaming (consistent with /api/chat) ─────────────────────────────
    // We stream the buffered response word-by-word so the client's streaming
    // reader works correctly regardless of whether this was a Gemini or REST response.
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        // Stream in chunks of ~50 chars rather than individual words —
        // this is faster than 8ms/word while still giving a streaming appearance.
        const CHUNK_SIZE = 50;
        let offset = 0;
        while (offset < fullResponse.length) {
          const slice = fullResponse.slice(offset, offset + CHUNK_SIZE);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ token: slice })}\n\n`)
          );
          offset += CHUNK_SIZE;
          // Small yield to prevent blocking the event loop
          await new Promise(r => setTimeout(r, 10));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });

  } catch (error: any) {
    console.error("❌ [Tools Synthesis Fault]:", error);
    return NextResponse.json({
      error: "Synthesis grid exception. Verify usage limits.",
      details: error.message
    }, { status: 500 });
  }
}
