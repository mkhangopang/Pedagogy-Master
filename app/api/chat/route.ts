import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse, generateAIResponseStream } from '../../../lib/ai/multi-provider-router';
import { detectToolIntent, getToolDisplayName } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';
import { DEFAULT_MASTER_PROMPT } from '../../../constants';
import { selfImprovementEngine } from '../../../lib/ai/self-improvement-engine';
import { GoogleGenAI } from '@google/genai';
import { resolveApiKey } from '../../../lib/env-server';

import { checkAndConsumeAiQuota, buildAiQuotaExceededMessage } from '../../../lib/rate-limit/free-tier-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BRAIN_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedBrainPrompt: { value: string; expiresAt: number } | null = null;

async function getCachedBrainPrompt(supabase: any): Promise<string> {
  if (cachedBrainPrompt && Date.now() < cachedBrainPrompt.expiresAt) {
    return cachedBrainPrompt.value;
  }
  const { data: brain } = await supabase
    .from('neural_brain')
    .select('master_prompt')
    .eq('is_active', true)
    .maybeSingle();
  const prompt = brain?.master_prompt || DEFAULT_MASTER_PROMPT;
  cachedBrainPrompt = { value: prompt, expiresAt: Date.now() + BRAIN_CACHE_TTL_MS };
  return prompt;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token || token === 'undefined' || token.length < 10) {
      return NextResponse.json({ error: 'Auth Required' }, { status: 401 });
    }

    const supabase = getSupabaseServerClient(token);
    const [{ data: { user } }, body] = await Promise.all([
      supabase.auth.getUser(token),
      req.json(),
    ]);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const { message, history = [], priorityDocumentId, adaptiveContext } = body;
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });

    const [quota, profileRes, activeMasterPrompt] = await Promise.all([
      checkAndConsumeAiQuota({
        supabase,
        userId: user.id,
        authEmail: user.email,
        routeName: 'chat_tutor',
      }),
      supabase.from('profiles').select('workspace_name').eq('id', user.id).maybeSingle(),
      getCachedBrainPrompt(supabase),
    ]);

    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: buildAiQuotaExceededMessage(quota),
          code: 'QUOTA_EXCEEDED',
          quota,
        },
        { status: 429 }
      );
    }

    const brandName = profileRes?.data?.workspace_name || 'Pedagogy Master AI';

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
        priorityDocumentId,
        { skipQuotaCheck: true, authEmail: user.email }
      );

      const encoder = new TextEncoder();
      const responseStream = new ReadableStream({
        async start(controller) {
          try {
            let fullCollectedText = '';
            for await (const token of stream) {
              if (typeof token === 'string' && token.startsWith('QUOTA_EXCEEDED')) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  error: token.replace(/^QUOTA_EXCEEDED:\s*/i, '') || 'Daily free synthesis limit reached. Resets tomorrow (UTC).',
                  code: 'QUOTA_EXCEEDED'
                })}\n\n`));
                controller.close();
                return;
              }
              fullCollectedText += token;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
            }
            
            const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pedagogy-master.vercel.app';
            const watermark = `\n\n\n---\n\n### 🏛️ ${brandName} Institutional Intelligence Hub\n*Synthesized via ${expertTitle}*\n\n✅ Verified alignment match. [Build your own verified curriculum assets here](${appUrl})\n`;
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