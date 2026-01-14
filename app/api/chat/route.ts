
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { retrieveRelevantChunks } from '../../../lib/rag/retriever';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { DEFAULT_MASTER_PROMPT } from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * NEURAL TUTOR ENGINE (v6.0 - CURRICULUM LOCKED)
 * Enforces strict RAG: Generation ABORTS if no curriculum chunks are found.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { message, selectedCurriculumId, selectedStandardId } = body;

    const supabase = getSupabaseServerClient(token);

    // 1. Mandatory Retrieval (Targeted)
    // We prioritize the selected standard ID or search the entire curriculum library for this user
    const targetQuery = selectedStandardId || message;
    const filterIds = selectedCurriculumId ? [selectedCurriculumId] : [];
    
    // If no curriculum is selected, we fetch all ready/approved curriculum IDs for this user
    let finalFilterIds = filterIds;
    if (finalFilterIds.length === 0) {
      const { data: userCurricula } = await supabase
        .from('documents')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'ready')
        .eq('sourceType', 'markdown');
      finalFilterIds = userCurricula?.map(c => c.id) || [];
    }

    if (finalFilterIds.length === 0) {
      return NextResponse.json({ 
        error: "RAG_ABORT", 
        message: "Institutional Guardrail: No active curriculum found. Please upload or select a Validated Markdown curriculum to begin." 
      }, { status: 422 });
    }

    const chunks = await retrieveRelevantChunks(targetQuery, finalFilterIds, supabase, 6);

    // 🚨 FEATURE 6: Hard-Fail Logic
    if (chunks.length === 0) {
      return NextResponse.json({ 
        error: "NO_CONTEXT", 
        message: "Institutional Guardrail: The requested topic or standard was not found in the authoritative curriculum context. Synthesis aborted to maintain standards alignment." 
      }, { status: 422 });
    }

    // 2. Synthesis (Strictly Grounded)
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    const contextVault = chunks.map((c, i) => `[CURRICULUM_CHUNK_${i+1}]\n${c.text}`).join('\n\n');
    
    const synthesisPrompt = `
# AUTHORITATIVE_CURRICULUM_CONTEXT
${contextVault}

# USER_REQUEST
"${message}"

CORE_DIRECTIVE: 
1. Use ONLY the curriculum chunks above. 
2. If the request cannot be answered by the context, state: "Context Insufficient for Standards Alignment."
3. Format with 1. and 1.1 headers.
`;

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
      config: { 
        systemInstruction: "You are a Strict Curriculum Tutor. You hard-fail if content is not in the provided assets.",
        temperature: 0.1 // High precision for curriculum alignment
      }
    });

    const responseText = result.text || "Synthesis error.";

    // 3. Status Stream
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`> *Neural Sync: Grounded in Authoritative Markdown Standards...*\n\n`));
        controller.enqueue(encoder.encode(responseText));
        
        // Citations
        const citations = `\n\n### Authoritative Source References:\n` + 
          chunks.slice(0, 2).map(c => `* [Standard ${c.sloCodes?.[0] || 'Ref'}] extracted from curriculum repository.`).join('\n');
        
        controller.enqueue(encoder.encode(citations));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
