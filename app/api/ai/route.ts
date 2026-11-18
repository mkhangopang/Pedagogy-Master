import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponseStream } from '../../../lib/ai/multi-provider-router';
import { detectToolIntent, ToolType, getToolDisplayName } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';
import { DEFAULT_MASTER_PROMPT } from '../../../constants';
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
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const [{ data: { user } }, body] = await Promise.all([
      anonClient.auth.getUser(token),
      req.json(),
    ]);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const { toolType, userInput, priorityDocumentId, adaptiveContext, history } = body;
    
    const supabase = getSupabaseServerClient(token);

    const [quota, profileRes, activeMasterPrompt] = await Promise.all([
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

    const brandName = profileRes?.data?.workspace_name || 'Pedagogy Master AI';

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
      priorityDocumentId,
      { skipQuotaCheck: true, authEmail: user.email }
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
