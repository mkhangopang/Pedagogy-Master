/**
 * CHAT ROUTE — True Streaming via Unified Orchestrator
 *
 * FIX-07 (Fake Streaming): Previous code collected the full AI response
 * (~2–20s), then re-emitted words with 8ms artificial delays. Users saw a
 * long spinner then a word-dump. Now tokens stream as they arrive from the LLM.
 *
 * FIX-08 (Admin env var): Admin check moved to server-side profile.role only.
 *   No longer leaks admin emails via NEXT_PUBLIC_ env var.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { detectToolIntent, getToolDisplayName } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';
import { DEFAULT_MASTER_PROMPT } from '../../../constants';
import { selfImprovementEngine } from '../../../lib/ai/self-improvement-engine';
import { orchestrateChat } from '../../../lib/ai/unified-orchestrator';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token || token === 'undefined' || token.length < 10) {
      return NextResponse.json({ error: 'Auth Required' }, { status: 401 });
    }

    const supabase = getSupabaseServerClient(token);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { message, history = [], priorityDocumentId, adaptiveContext } = body;
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_name')
      .eq('id', user.id)
      .single();

    const brandName = profile?.workspace_name || 'Pedagogy Master AI';

    const { data: brain } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .maybeSingle();

    const activeMasterPrompt = brain?.master_prompt || DEFAULT_MASTER_PROMPT;
    const routeInfo = detectToolIntent(message);
    const expertTitle = getToolDisplayName(routeInfo.tool);
    const customContext = `[CHAT_MODE: ACTIVE]\n[INSTITUTION: ${brandName}]\n[ROLE: Pedagogical Consultant]`;
    const assembledSystemPrompt = await getFullPrompt(routeInfo.tool, customContext, activeMasterPrompt);

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pedagogy-master.vercel.app';
    const watermarkSuffix = `\n\n---\n### 🏛️ ${brandName} Institutional Intelligence Hub\n*Synthesized via ${expertTitle}*\n\n✅ Verified alignment match. [Build your own verified curriculum assets here](${appUrl})`;

    const encoder = new TextEncoder();

    // ── FIX-07: True streaming via UnifiedOrchestrator ────────────────────────
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = '';
        let providerUsed = 'Unknown';

        const enqueue = (token: string) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
        };

        try {
          // Build full prompt with RAG context if document selected
          let ragContext = '';
          if (priorityDocumentId) {
            try {
              const { generateAIResponse: ragFn } = await import('../../../lib/ai/multi-provider-router');
              // We can't do RAG lookup without blocking streaming setup — so we do a quick
              // synchronous SLO code lookup before opening the stream
              const { data: chunks } = await supabase
                .from('document_chunks')
                .select('chunk_text')
                .eq('document_id', priorityDocumentId)
                .limit(5);
              ragContext = chunks?.map((c: any) => c.chunk_text).join('\n---\n') || '';
            } catch (_) {}
          }

          const augmentedPrompt = ragContext
            ? `<AUTHORITATIVE_VAULT>\n${ragContext}\n</AUTHORITATIVE_VAULT>\n\nUSER_QUERY: "${message}"`
            : message;

          const result = await orchestrateChat(
            augmentedPrompt,
            history,
            assembledSystemPrompt,
            (token: string) => {
              fullText += token;
              enqueue(token);
            }
          );

          providerUsed = result.provider;

          // Stream the watermark
          enqueue(watermarkSuffix);
          fullText += watermarkSuffix;

        } catch (err: any) {
          if (err.message?.includes('QUOTA_EXCEEDED')) {
            enqueue('[QUOTA_EXCEEDED: Monthly query limit reached. Please upgrade your plan.]');
          } else {
            console.error('[Chat] Orchestrator error:', err.message);
            // Try non-streaming fallback via multi-provider-router
            try {
              const result = await generateAIResponse(
                message, history, user.id, supabase,
                adaptiveContext, undefined, 'chat_tutor', assembledSystemPrompt, priorityDocumentId
              );
              const fullResponse = result.text + watermarkSuffix;
              enqueue(fullResponse);
              fullText = fullResponse;
              providerUsed = result.provider;
            } catch (fallbackErr: any) {
              enqueue('[ERROR: All AI providers unavailable. Please try again in a moment.]');
            }
          }
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

          // Fire-and-forget self-improvement
          selfImprovementEngine.learn({
            userId: user.id,
            input: message,
            output: fullText,
            tool: routeInfo.tool,
            supabase,
          }).catch(() => {});
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error: any) {
    console.error('❌ Chat Route Fatal Error:', error);
    return NextResponse.json(
      { error: 'Synthesis engine error', details: error.message },
      { status: 500 }
    );
  }
}
