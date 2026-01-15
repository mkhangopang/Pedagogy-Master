
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
 * NEURAL TUTOR ENGINE (v9.0 - PEDAGOGY MASTER)
 * Force-maps all responses to curriculum standards.
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

    // 1. Identify Context (Library Search)
    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id, name, authority')
      .eq('user_id', user.id)
      .or(`is_selected.eq.true${priorityDocumentId ? `,id.eq.${priorityDocumentId}` : ''}`)
      .eq('status', 'ready');

    const finalFilterIds = selectedDocs?.map(d => d.id) || [];
    const hasContext = finalFilterIds.length > 0;

    // 2. Retrieval (Curriculum Grounding)
    let contextVault = "";
    let chunks: any[] = [];

    if (hasContext) {
      chunks = await retrieveRelevantChunks(message, finalFilterIds, supabase, 10, priorityDocumentId);
      
      if (chunks.length > 0) {
        contextVault = "### 📚 AUTHORITATIVE CURRICULUM VAULT (LOCKED):\n";
        chunks.forEach((c, i) => {
          contextVault += `[ASSET_NODE_${i+1}] SOURCE: ${c.sloCodes?.join(', ')}\nCONTENT: ${c.text}\n\n`;
        });
      }
    }

    // 3. System Brain Setup
    const { data: brainData } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const basePersona = brainData?.master_prompt || DEFAULT_MASTER_PROMPT;
    
    // Explicit Grounding Logic
    const systemInstruction = `
${basePersona}

## ACTIVE NEURAL STATE
- CONTEXT_AVAILABLE: ${chunks.length > 0 ? 'TRUE' : 'FALSE'}
- TARGET_AUTHORITY: ${selectedDocs?.[0]?.authority || 'General'}
- FORCED_MARKDOWN: You MUST use "# Unit: [Name]" for all headers.

${chunks.length > 0 ? NUCLEAR_GROUNDING_DIRECTIVE : ''}
`;

    // 4. Remote Neural Call (Defaulting to Gemini for highest reasoning)
    const apiKey = resolveApiKey();
    const ai = new GoogleGenAI({ apiKey });
    
    const contents: any[] = [];
    history.slice(-4).forEach((h: any) => {
      contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] });
    });
    
    const finalPrompt = `
${contextVault}

# USER QUERY
"${message}"

(Instruction: If this is an SLO query like S-08-A-03, provide a full curriculum-aligned response using # Unit: formatting.)
`;
    
    contents.push({ role: 'user', parts: [{ text: finalPrompt }] });

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents,
      config: { 
        systemInstruction,
        temperature: chunks.length > 0 ? 0.1 : 0.6,
        topK: 40,
      }
    });

    const responseText = result.text || "Neural connection reset.";

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        if (chunks.length > 0) {
          controller.enqueue(encoder.encode(`> *Neural Sync: Grounding in "${selectedDocs?.[0]?.name}" [${chunks.length} nodes]...*\n\n`));
        } else if (hasContext) {
          controller.enqueue(encoder.encode(`> *Alert: No direct matches in curriculum. Using general pedagogical logic...*\n\n`));
        }
        
        controller.enqueue(encoder.encode(responseText));
        
        if (chunks.length > 0) {
          const refs = `\n\n### Neural Grounding References:\n` + 
            chunks.slice(0, 3).map(c => `* **SLO ${c.sloCodes?.[0] || 'Metadata'}** retrieved from ${selectedDocs?.find(d=>d.id === finalFilterIds[0])?.name || 'Curriculum Library'}`).join('\n');
          controller.enqueue(encoder.encode(refs));
        }
        
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("Chat Error:", error);
    return NextResponse.json({ error: "RAG_ABORT", message: "Grid saturation. Please re-select curriculum and retry." }, { status: 500 });
  }
}
