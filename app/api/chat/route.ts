
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { retrieveRelevantChunks } from '../../../lib/rag/retriever';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { DEFAULT_MASTER_PROMPT, NUCLEAR_GROUNDING_DIRECTIVE } from '../../../constants';
import { resolveApiKey } from '../../../lib/env-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * NEURAL TUTOR ENGINE (v8.0 - ADAPTIVE RAG)
 * Persona: Pedagogy Master Multi-Agent AI
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { message, priorityDocumentId, history = [] } = body;

    const supabase = getSupabaseServerClient(token);

    // 1. Fetch Selected Context
    // We look for specifically selected documents OR the priority one
    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id, name')
      .eq('user_id', user.id)
      .or(`is_selected.eq.true${priorityDocumentId ? `,id.eq.${priorityDocumentId}` : ''}`)
      .eq('status', 'ready');

    const finalFilterIds = selectedDocs?.map(d => d.id) || [];
    const hasSelection = finalFilterIds.length > 0;

    // 2. Adaptive Retrieval
    let contextVault = "";
    let chunks: any[] = [];

    if (hasSelection) {
      console.log(`🔍 [RAG] Searching across ${finalFilterIds.length} assets...`);
      chunks = await retrieveRelevantChunks(message, finalFilterIds, supabase, 10, priorityDocumentId);
      
      if (chunks.length > 0) {
        contextVault = "### 📚 AUTHORITATIVE CURRICULUM VAULT (LOCKED CONTEXT):\n";
        chunks.forEach((c, i) => {
          contextVault += `[NODE_${i+1}] | SOURCE: ${c.sloCodes?.join(', ') || 'General'}\nCONTENT: ${c.text}\n\n`;
        });
      }
    }

    // 3. System Persona Synthesis
    const { data: brainData } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const basePersona = brainData?.master_prompt || DEFAULT_MASTER_PROMPT;
    
    // Construct Enhanced System Instruction
    const systemInstruction = `
${basePersona}

## ADAPTIVE RAG STATE
${chunks.length > 0 ? '🟢 CONTEXT_LOCKED: Ground responses strictly in provided nodes.' : '🟡 GENERAL_MODE: No specific nodes found for query. Provide high-quality general guidance.'}

${chunks.length > 0 ? NUCLEAR_GROUNDING_DIRECTIVE : ''}
`;

    // 4. Remote Neural Call
    const apiKey = resolveApiKey();
    const ai = new GoogleGenAI({ apiKey });
    
    // Prepare contents with history
    const contents: any[] = [];
    history.slice(-6).forEach((h: any) => {
      contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] });
    });
    
    const finalPrompt = `
${contextVault}

# USER QUERY
"${message}"
`;
    
    contents.push({ role: 'user', parts: [{ text: finalPrompt }] });

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents,
      config: { 
        systemInstruction,
        temperature: chunks.length > 0 ? 0.1 : 0.6,
        topK: 40,
        topP: 0.95
      }
    });

    const responseText = result.text || "Synthesis error: Empty stream.";

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        if (chunks.length > 0) {
          controller.enqueue(encoder.encode(`> *Neural Grid: Grounded in ${chunks.length} curriculum segments from "${selectedDocs?.[0]?.name}"...*\n\n`));
        } else if (hasSelection) {
          controller.enqueue(encoder.encode(`> *Alert: No direct matches in selected curriculum. Providing general pedagogical logic...*\n\n`));
        }
        
        controller.enqueue(encoder.encode(responseText));
        
        if (chunks.length > 0) {
          const refs = `\n\n### Neural Grounding References:\n` + 
            chunks.slice(0, 3).map(c => `* **Standard ${c.sloCodes?.[0] || 'Node'}** (${(c.similarity * 100).toFixed(0)}% match)`).join('\n');
          controller.enqueue(encoder.encode(refs));
        }
        
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("Chat Error:", error);
    return NextResponse.json({ 
      error: "RAG_ABORT", 
      message: error.message || "The synthesis grid encountered a bottleneck." 
    }, { status: 500 });
  }
}
