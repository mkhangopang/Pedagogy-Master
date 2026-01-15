
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { retrieveRelevantChunks } from '../../../lib/rag/retriever';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { DEFAULT_MASTER_PROMPT } from '../../../constants';
import { resolveApiKey } from '../../../lib/env-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * NEURAL TUTOR ENGINE (v7.0 - ADAPTIVE RAG)
 * Fixes: Database column names, Dynamic Brain logic, and Retrieval fallback.
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

    // 1. Fetch the Active Neural Brain for System Instructions
    const { data: brainData } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const systemInstruction = brainData?.master_prompt || DEFAULT_MASTER_PROMPT;

    // 2. Mandatory Retrieval (Adaptive)
    const targetQuery = selectedStandardId || message;
    
    // Identify filtering context
    let finalFilterIds: string[] = selectedCurriculumId ? [selectedCurriculumId] : [];
    
    if (finalFilterIds.length === 0) {
      // FIX: Database column is 'source_type', not 'sourceType'
      const { data: userCurricula } = await supabase
        .from('documents')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'ready')
        .eq('source_type', 'markdown');
        
      finalFilterIds = userCurricula?.map(c => c.id) || [];
    }

    if (finalFilterIds.length === 0) {
      return NextResponse.json({ 
        error: "RAG_ABORT", 
        message: "Institutional Guardrail: No Neural-Indexed curriculum assets found in your library. Please upload a Markdown curriculum to begin." 
      }, { status: 422 });
    }

    // Attempt to retrieve chunks
    const chunks = await retrieveRelevantChunks(targetQuery, finalFilterIds, supabase, 8);

    if (chunks.length === 0) {
      // Second attempt with broader keywords if photosynthesis or specific topics fail
      const broadQuery = message.split(' ').slice(0, 3).join(' ');
      const fallbackChunks = await retrieveRelevantChunks(broadQuery, finalFilterIds, supabase, 4);
      if (fallbackChunks.length === 0) {
        return NextResponse.json({ 
          error: "NO_CONTEXT", 
          message: "Institutional Guardrail: The topic was not found in your curriculum context. Please ensure the relevant unit is indexed." 
        }, { status: 422 });
      }
      chunks.push(...fallbackChunks);
    }

    // 3. Synthesis (Strictly Grounded)
    const apiKey = resolveApiKey();
    const ai = new GoogleGenAI({ apiKey });
    
    const contextVault = chunks.map((c, i) => `[CURRICULUM_ASSET_NODE_${i+1}]\nSOURCE_SLO: ${c.sloCodes?.join(', ')}\nCONTENT: ${c.text}`).join('\n\n');
    
    const synthesisPrompt = `
# AUTHORITATIVE_CURRICULUM_VAULT
${contextVault}

# USER_PEDAGOGICAL_REQUEST
"${message}"

STRICT_DIRECTIVES:
1. You are a curriculum-locked pedagogical assistant.
2. USE ONLY the VAULT content above to answer.
3. Reference standards by their SLO codes (e.g., S-04-A-01).
4. If the vault doesn't contain sufficient data for the specific grade level requested, explain why.
5. Format response with professional educational headings (1., 1.1).
`;

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
      config: { 
        systemInstruction: `${systemInstruction}\n\nSTRICT_RAG_ENFORCEMENT: Response must be 100% grounded in provided curriculum nodes.`,
        temperature: 0.1 
      }
    });

    const responseText = result.text || "Synthesis engine timed out.";

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`> *Neural Sync Active: Grounding in ${chunks.length} curriculum nodes...*\n\n`));
        controller.enqueue(encoder.encode(responseText));
        
        const citations = `\n\n### Neural Grounding References:\n` + 
          chunks.slice(0, 3).map(c => `* **Standard ${c.sloCodes?.[0] || 'Uncoded'}** matched via ${(c.similarity * 100).toFixed(1)}% semantic proximity.`).join('\n');
        
        controller.enqueue(encoder.encode(citations));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: error.message || "Synthesis grid saturated." }, { status: 500 });
  }
}
