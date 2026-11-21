import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponseStream } from '../../../lib/ai/multi-provider-router';
import { detectToolIntent, ToolType, getToolDisplayName } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';
import { DEFAULT_MASTER_PROMPT } from '../../../constants';
import { checkAndConsumeAiQuota, buildAiQuotaExceededMessage } from '../../../lib/rate-limit/free-tier-guard';
import {
  buildGuestQuotaExceededMessage,
  consumeGuestQuota,
  extractRequestIp,
  isGuestToken,
  verifyGuestToken,
} from '../../../lib/auth/guest-token';

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
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token || token === 'undefined' || token.length < 10) {
      return NextResponse.json({ error: 'Auth Required' }, { status: 401 });
    }

    const body = await req.json();
    const { toolType, userInput, priorityDocumentId, adaptiveContext, history } = body;

    let userId: string;
    let userEmail: string | null = null;
    let isGuest = false;
    let supabase: any;
    let brandName = 'Pedagogy Master AI';
    let activeMasterPrompt = DEFAULT_MASTER_PROMPT;

    if (isGuestToken(token)) {
      const guestPayload = verifyGuestToken(token);
      if (!guestPayload) {
        return NextResponse.json({ error: 'Guest preview session expired. Please verify again or create a free account.' }, { status: 401 });
      }
      const clientIp = extractRequestIp(req.headers);
      const guestQuota = await consumeGuestQuota({ guestId: guestPayload.sub, clientIp });
      if (!guestQuota.allowed) {
        return NextResponse.json(
          {
            error: buildGuestQuotaExceededMessage(guestQuota),
            code: 'QUOTA_EXCEEDED',
            isGuest: true,
            quota: guestQuota,
          },
          { status: 429 }
        );
      }
      isGuest = true;
      userId = guestPayload.sub;
      brandName = 'Guest Preview Node';
      supabase = anonClient;
    } else {
      const { data: { user } } = await anonClient.auth.getUser(token);
      if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

      userId = user.id;
      userEmail = user.email ?? null;
      supabase = getSupabaseServerClient(token);

      const [quota, profileRes, brainPrompt] = await Promise.all([
        checkAndConsumeAiQuota({
          supabase,
          userId: user.id,
          authEmail: user.email,
          routeName: toolType || 'neural_tool',
        }),
        supabase.from('profiles').select('workspace_name, name').eq('id', user.id).maybeSingle(),
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

      brandName = profileRes?.data?.workspace_name || 'Pedagogy Master AI';
      activeMasterPrompt = brainPrompt;
    }

    const safeInput = String(userInput || '').slice(0, isGuest ? 2000 : 12000);
    const safePriorityDocId = isGuest ? undefined : priorityDocumentId;
    const safeHistory = Array.isArray(history) ? history.slice(isGuest ? -2 : -6) : [];

    const routeInfo = toolType ? { tool: toolType as ToolType } : detectToolIntent(safeInput);
    const effectiveTool = routeInfo.tool;
    const expertTitle = getToolDisplayName(effectiveTool);

    const customContext = `[INSTITUTION: ${brandName}]\n[INSTRUCTION: Format headers for ${brandName} standards.]\n[SPECIALIST: ${expertTitle}]`;
    const systemPrompt = await getFullPrompt(effectiveTool, customContext, activeMasterPrompt);

    const stream = generateAIResponseStream(
      safeInput,
      safeHistory,
      userId,
      supabase,
      adaptiveContext,
      undefined,
      effectiveTool,
      systemPrompt,
      safePriorityDocId,
      { skipQuotaCheck: true, authEmail: userEmail, isGuest }
    );

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const token of stream) {
            if (typeof token === 'string' && token.startsWith('QUOTA_EXCEEDED')) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: token.replace(/^QUOTA_EXCEEDED:\s*/i, ''), code: 'QUOTA_EXCEEDED' })}\n\n`));
              controller.close();
              return;
            }
            const payload = JSON.stringify({ token });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
          
          const groundedNote = ` | Standards Anchored: ${safePriorityDocId ? 'YES' : 'NO'}`;
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
