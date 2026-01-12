
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks } from '../../../lib/rag/retriever';
import { GoogleGenAI } from '@google/genai';
import { DEFAULT_MASTER_PROMPT, NUCLEAR_GROUNDING_DIRECTIVE } from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * NEURAL BRAIN CHAT ENGINE (v2.0)
 * Orchestrates pedagogical grounding with the "Pedagogy Master" core persona.
 * Updated: Document-independent and SLO-centric search logic.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { message, priorityDocumentId } = body;

    const supabase = getSupabaseServerClient(token);

    // 1. Fetch active Neural Brain configuration
    const { data: brainData } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const activeMasterPrompt = brainData?.master_prompt || DEFAULT_MASTER_PROMPT;

    // 2. Identification of context (Automatic selection)
    const { data: allDocs } = await supabase
      .from('documents')
      .select('id, name, rag_indexed')
      .eq('user_id', user.id);

    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_selected', true);
    
    // SLO-CENTRIC LOGIC: If no documents are manually selected, search across ALL available documents
    let documentIds = selectedDocs?.map(d => d.id) || [];
    if (documentIds.length === 0) {
      documentIds = allDocs?.map(d => d.id) || [];
    }

    if (!allDocs || allDocs.length === 0) {
      return new Response(`📚 **Pedagogy Master (v2.0)**: 
      
It looks like your **Library** is empty. Please upload curriculum documents (PDF, Word, or TXT) in the **Curriculum Docs** section to enable neural tutoring and SLO alignment.`);
    }

    // 3. Neural Semantic Memory Retrieval
    const retrievedChunks = await retrieveRelevantChunks(
      message, 
      documentIds, 
      supabase, 
      12, // Context window
      priorityDocumentId
    );

    // 4. Handle context retrieval gaps
    if (retrievedChunks.length === 0) {
      return new Response(`**DATA_UNAVAILABLE**: 
      
I searched through your ${allDocs.length} curriculum assets but found no high-confidence pedagogical data for: "${message}".

**Action Steps**:
- Mention a specific SLO code (e.g., S8a5).
- Ensure your curriculum documents contain the requested topic.
- If you just uploaded files, click **Sync Neural Nodes** in the Library.`);
    }

    // 5. Memory Vault Synthesis
    const contextVault = retrievedChunks.map((c, i) => (
      `### [MEMORY_NODE_${i+1}] (Source: ${c.pageNumber || 'N/A'}, SLOs: ${c.sloCodes.join(', ') || 'N/A'})
      ${c.text}`
    )).join('\n\n');

    // 6. Gemini Synthesis Execution
    const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey });
    
    const systemInstruction = `${activeMasterPrompt}

---
${NUCLEAR_GROUNDING_DIRECTIVE}

STRICT GROUNDING RULES:
- Source of truth: ONLY the provided MEMORY_VAULT.
- Automatic Detection: You are already provided with the most relevant curriculum nodes. Use them.
- If specific data is missing: Explicitly state "DATA_UNAVAILABLE".
- Citation format: "Based on [Memory Node X], ..."
- Style: Markdown headers (1., 1.1), tables, bullet points. NO BOLD HEADINGS.`;

    const synthesisPrompt = `
# MEMORY_VAULT (Active Curriculum Context):
${contextVault}

# TEACHER QUERY:
"${message}"

Synthesize a world-class pedagogical response using the Neural Brain logic. Reference all mentioned SLOs in [brackets].
`;

    const streamResponse = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
      config: {
        systemInstruction,
        temperature: 0.1, // High precision
      }
    });

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamResponse) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
          }
        } catch (err) {
          console.error('[Stream Failure]:', err);
          controller.enqueue(encoder.encode("\n\n[Synthesis Interrupted: Remote Node Connection Error]"));
        } finally {
          controller.close();
        }
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error('[Chat Engine Fatal]:', error);
    return NextResponse.json({ 
      error: `Synthesis failure: ${error.message || 'Check Neural Connectivity'}` 
    }, { status: 500 });
  }
}
