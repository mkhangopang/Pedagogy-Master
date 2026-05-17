import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse, generateAIResponseStream } from '../../../lib/ai/multi-provider-router';
import { detectToolIntent, getToolDisplayName } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';
import { DEFAULT_MASTER_PROMPT } from '../../../constants';
import { selfImprovementEngine } from '../../../lib/ai/self-improvement-engine';
import { GoogleGenAI } from '@google/genai';
import { resolveApiKey } from '../../../lib/env-server';

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

    try {
      const stream = generateAIResponseStream(
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

      const encoder = new TextEncoder();
      const responseStream = new ReadableStream({
        async start(controller) {
          try {
            let fullCollectedText = '';
            for await (const token of stream) {
              fullCollectedText += token;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
            }
            
            const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pedagogy-master.vercel.app';
            const watermark = `\n\n---\n### 🏛️ ${brandName} Institutional Intelligence Hub\n*Synthesized via ${expertTitle}*\n\n✅ Verified alignment match. [Build your own verified curriculum assets here](${appUrl})`;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: watermark })}\n\n`));
            
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));

            // Async Self-Improvement
            selfImprovementEngine.learn({
              userId: user.id,
              input: message,
              output: fullCollectedText,
              tool: routeInfo.tool,
              supabase
            }).catch(() => {});
          } catch (err: any) {
             console.error("Chat Stream Error:", err);
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

    } catch (err: any) {
      if (err.message?.includes('QUOTA_EXCEEDED')) {
        return NextResponse.json({
          error: 'Monthly query limit reached. Please upgrade your plan.',
          code: 'QUOTA_EXCEEDED'
        }, { status: 429 });
      }
      throw err;
    }

  } catch (error: any) {
    console.error("❌ Conversational Node Error:", error);
    return NextResponse.json({ error: 'Synthesis engine error', details: error.message }, { status: 500 });
  }
}