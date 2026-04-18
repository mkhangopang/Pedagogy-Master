import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { detectToolIntent, getToolDisplayName } from '../../../lib/ai/tool-router';
import { getFullPrompt } from '../../../lib/ai/prompt-manager';
import { DEFAULT_MASTER_PROMPT } from '../../../constants';
import { selfImprovementEngine } from '../../../lib/ai/self-improvement-engine';
import { retrieveRelevantChunks } from '../../../lib/rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../../../lib/rag/slo-extractor';
import { classifyIntent } from '../../../lib/ai/intent-classifier';
import { kv } from '../../../lib/kv';
import { createHash } from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { resolveApiKey } from '../../../lib/env-server';
import { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ── Helpers ─────────────────────────────────────────────────────────────────

async function enforceQuota(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: quotaOk, error } = await supabase.rpc('increment_query_count', { p_user_id: userId });
  return !error && quotaOk !== false;
}

async function buildVaultContent(
  userPrompt: string,
  priorityDocumentId: string | undefined,
  supabase: SupabaseClient
): Promise<{ vaultContent: string; isGrounded: boolean; sourceDocName: string; topChunkIds: string[] }> {
  if (!priorityDocumentId) {
    return { vaultContent: '', isGrounded: false, sourceDocName: '', topChunkIds: [] };
  }

  const { data: activeDoc } = await supabase
    .from('documents')
    .select('id, name, master_md_dialect')
    .eq('id', priorityDocumentId)
    .single();

  if (!activeDoc) {
    return { vaultContent: '', isGrounded: false, sourceDocName: '', topChunkIds: [] };
  }

  // Try exact SLO code match first
  const codes = extractSLOCodes(userPrompt);
  if (codes.length > 0) {
    const { data: sloMatch } = await supabase
      .from('document_chunks')
      .select('id, chunk_text')
      .contains('slo_codes', [normalizeSLO(codes[0].code)])
      .eq('document_id', activeDoc.id)
      .limit(1);

    if (sloMatch?.[0]) {
      return {
        vaultContent: `### AUTHORITATIVE_SLO_EXTRACT (Exact Match)\nSource: ${activeDoc.name}\n\n${sloMatch[0].chunk_text}`,
        isGrounded: true,
        sourceDocName: activeDoc.name,
        topChunkIds: [sloMatch[0].id]
      };
    }
  }

  // Semantic search fallback
  const chunks = await retrieveRelevantChunks({
    query: userPrompt,
    documentIds: [activeDoc.id],
    supabase,
    matchCount: 8,
    dialect: activeDoc.master_md_dialect
  });

  if (chunks.length > 0) {
    return {
      vaultContent: `### AUTHORITATIVE_CURRICULUM_EXTRACTS\nSource: ${activeDoc.name}\n\n` +
        chunks.map((c, i) => `--- Chunk ${i + 1} ---\n${c.chunk_text}`).join('\n\n'),
      isGrounded: true,
      sourceDocName: activeDoc.name,
      topChunkIds: chunks.map(c => c.chunk_id)
    };
  }

  return {
    vaultContent: '',
    isGrounded: false,
    sourceDocName: activeDoc.name,
    topChunkIds: []
  };
}

function buildVaultInstruction(vaultContent: string, isGrounded: boolean, sourceDocName: string, priorityDocumentId?: string): string {
  if (isGrounded) {
    return `<AUTHORITATIVE_VAULT status="GROUNDED" source="${sourceDocName}">
${vaultContent}
</AUTHORITATIVE_VAULT>

CRITICAL GROUNDING RULE: Base your response on the curriculum content above.
Only cite SLO codes and standards that appear in the vault. Enrich with pedagogical frameworks (Bloom's, Hunter, 5E) but the curriculum content must come from the vault.
If the vault lacks detail for a request, say so rather than inventing content.`;
  }

  if (priorityDocumentId) {
    return `<AUTHORITATIVE_VAULT status="RETRIEVAL_FAILED">
No matching content found in the selected document for this query.
</AUTHORITATIVE_VAULT>

IMPORTANT: A curriculum document is selected but no matching content was found. Provide general pedagogical guidance and explicitly state: "I could not find this specific content in your curriculum document. This is general guidance."
Do NOT invent SLO codes or curriculum-specific details.`;
  }

  return `<AUTHORITATIVE_VAULT status="NO_DOCUMENT">
No curriculum document selected.
</AUTHORITATIVE_VAULT>

Respond using established pedagogical frameworks and general educational best practices. If the user seems to want curriculum-specific content, suggest they upload and select a curriculum document for grounded responses.`;
}

// ── Real SSE streaming using Gemini native SDK ────────────────────────────────

async function* streamFromGemini(
  finalPrompt: string,
  history: any[],
  systemPrompt: string
): AsyncGenerator<string> {
  const apiKey = process.env.API_KEY || resolveApiKey();
  if (!apiKey) throw new Error('Gemini API key not configured');

  const ai = new GoogleGenAI({ apiKey });

  // Try Gemini 2.5 Pro first, fall back to Flash
  const modelsToTry = ['gemini-2.5-pro-preview-05-06', 'gemini-2.0-flash'];

  for (const model of modelsToTry) {
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: [
          ...history.map((h: any) => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }]
          })),
          { role: 'user', parts: [{ text: finalPrompt }] }
        ],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
        }
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield text;
      }
      return; // Success — exit after first working model

    } catch (e: any) {
      const msg = e?.message || '';
      // If rate-limited on Pro, fall through to Flash
      if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        console.warn(`[Stream] ${model} rate-limited, trying next model.`);
        continue;
      }
      throw e; // Other errors are fatal
    }
  }

  throw new Error('All Gemini models rate-limited');
}

// ── Buffered fallback for non-Gemini providers ────────────────────────────────

async function bufferFromRestProvider(
  finalPrompt: string,
  history: any[],
  systemPrompt: string
): Promise<string> {
  // Try REST providers in order: SambaNova → Cerebras → Mistral → OpenRouter
  const providers = [
    { name: 'SambaNova', url: 'https://api.sambanova.ai/v1/chat/completions', model: 'Meta-Llama-3.1-405B-Instruct', key: process.env.SAMBANOVA_API_KEY },
    { name: 'Cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', model: 'llama3.1-70b', key: process.env.CEREBRAS_API_KEY },
    { name: 'Mistral', url: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-large-latest', key: process.env.API_MISTRAL },
    { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openrouter/auto', key: process.env.OPENROUTER_API_KEY },
  ];

  for (const p of providers) {
    if (!p.key) continue;
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-6).map((h: any) => ({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.content
        })),
        { role: 'user', content: finalPrompt }
      ];

      const res = await fetch(p.url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${p.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: p.model, messages, temperature: 0.1, max_tokens: 8192 })
      });

      if (!res.ok) throw new Error(`${p.name}: HTTP ${res.status}`);
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error(`${p.name}: empty response`);
      return text;

    } catch (e: any) {
      console.warn(`[Fallback] ${p.name} failed: ${e.message}`);
    }
  }

  throw new Error('All REST providers failed');
}

// ── Main handler ──────────────────────────────────────────────────────────────

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
    // FIX BUG 4: Expect a clean `message` (pure user query) and separate `adaptiveContext`.
    // The client should NOT wrap the user query in persona context here.
    const { message, history = [], priorityDocumentId, adaptiveContext } = body;
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });

    // Quota check
    const quotaOk = await enforceQuota(supabase, user.id);
    if (!quotaOk) {
      return NextResponse.json({
        error: 'Monthly query limit reached. Please upgrade your plan.',
        code: 'QUOTA_EXCEEDED'
      }, { status: 429 });
    }

    // Profile + brain
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

    // Intent + tool routing
    const intentData = await classifyIntent(message);
    const routeInfo = detectToolIntent(message);
    const expertTitle = getToolDisplayName(routeInfo.tool);
    const customContext = `[CHAT_MODE: ACTIVE]\n[INSTITUTION: ${brandName}]\n[ROLE: Pedagogical Consultant]\n${adaptiveContext || ''}`;
    const systemPrompt = await getFullPrompt(routeInfo.tool, customContext, activeMasterPrompt);

    // Cache lookup (includes doc ID to prevent stale hallucinated responses)
    const cacheKeyInput = `${message}|doc:${priorityDocumentId || 'none'}`;
    const cacheKey = `chat:${createHash('sha256').update(cacheKeyInput).digest('hex')}`;
    const cached = await kv.get<string>(cacheKey);

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pedagogy-master.vercel.app';
    const encoder = new TextEncoder();

    if (cached) {
      // Serve cache as SSE stream
      const watermark = `\n\n---\n### 🏛️ ${brandName}\n*${expertTitle} (Neural Cache)*\n\n✅ [Build curriculum assets here](${appUrl})`;
      const fullResponse = cached + watermark;
      const words = fullResponse.split(' ');

      const stream = new ReadableStream({
        async start(controller) {
          for (const word of words) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: word + ' ' })}\n\n`));
            await new Promise(r => setTimeout(r, 5));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' }
      });
    }

    // Build vault (grounded context from document)
    const { vaultContent, isGrounded, sourceDocName, topChunkIds } = await buildVaultContent(
      message, priorityDocumentId, supabase
    );
    const vaultInstruction = buildVaultInstruction(vaultContent, isGrounded, sourceDocName, priorityDocumentId);

    const finalPrompt = `
<CONTEXT>
INTENT: ${intentData.intent} | COMPLEXITY: ${intentData.complexity}
${adaptiveContext || ''}
</CONTEXT>

${vaultInstruction}

USER_QUERY: "${message}"`;

    // ── TRUE STREAMING via Gemini ─────────────────────────────────────────────
    const start = Date.now();
    let providerUsed = 'Gemini';
    let fullText = '';

    const stream = new ReadableStream({
      async start(controller) {
        const sendToken = (token: string) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
        };

        try {
          // Attempt real streaming from Gemini
          for await (const chunk of streamFromGemini(finalPrompt, history.slice(-6), systemPrompt)) {
            fullText += chunk;
            sendToken(chunk);
          }
          providerUsed = 'Gemini';
        } catch (streamErr: any) {
          console.warn('[Chat] Gemini stream failed, falling back to buffered REST:', streamErr.message);

          // Fallback: buffer from REST provider, then stream the result
          try {
            fullText = await bufferFromRestProvider(finalPrompt, history.slice(-6), systemPrompt);
            providerUsed = 'Fallback REST';

            // Stream the buffered result word by word so UX stays consistent
            const words = fullText.split(' ');
            for (const word of words) {
              sendToken(word + ' ');
              await new Promise(r => setTimeout(r, 5));
            }
          } catch (fallbackErr: any) {
            const errMsg = '\n\n⚠️ All AI providers are currently rate-limited. Please wait 60 seconds and try again.';
            sendToken(errMsg);
            fullText += errMsg;
          }
        }

        // Watermark
        const groundedNote = isGrounded ? ` | Grounded: ${sourceDocName}` : '';
        const watermark = `\n\n---\n### 🏛️ ${brandName}\n*${expertTitle} (${providerUsed})${groundedNote}*\n\n✅ [Build curriculum assets here](${appUrl})`;
        sendToken(watermark);
        fullText += watermark;

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();

        // Async post-processing
        const latency = Date.now() - start;

        supabase.from('retrieval_logs').insert({
          user_id: user.id,
          query_text: message,
          top_chunk_ids: topChunkIds,
          confidence_score: isGrounded ? 0.95 : 0.4,
          latency_ms: latency,
          provider_used: providerUsed
        }).then();

        // Only cache simple lookups with grounded or doc-free responses
        const isCacheable =
          intentData.complexity < 3 &&
          intentData.intent === 'lookup' &&
          !message.toLowerCase().includes('create') &&
          !message.toLowerCase().includes('generate') &&
          (isGrounded || !priorityDocumentId);

        if (isCacheable) {
          kv.set(cacheKey, fullText.split('---\n### 🏛️')[0].trim(), 3600);
        }

        selfImprovementEngine.learn({
          userId: user.id,
          input: message,
          output: fullText,
          tool: routeInfo.tool,
          supabase
        }).catch(() => {});
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
    console.error("❌ Conversational Node Error:", error);
    return NextResponse.json({ error: 'Synthesis engine error', details: error.message }, { status: 500 });
  }
}
