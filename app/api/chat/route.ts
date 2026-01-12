
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

    // 2. Identification of selected curriculum context
    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_selected', true);
    
    const documentIds = selectedDocs?.map(d => d.id) || [];

    if (documentIds.length === 0) {
      return new Response(`📚 **Pedagogy Master (v2.0)**: 
      
Active curriculum context is required for neural grounding. Please select at least one document from the sidebar in your **Library**.`);
    }

    // 3. Neural Semantic Memory Retrieval
    const retrievedChunks = await retrieveRelevantChunks(
      message, 
      documentIds, 
      supabase, 
      12, // Increased context window for complex pedagogical requests
      priorityDocumentId
    );

    // 4. Handle context retrieval gaps while maintaining persona
    if (retrievedChunks.length === 0) {
      return new Response(`**DATA_UNAVAILABLE**: 
      
I searched your ${selectedDocs?.length} selected curriculum assets but found no high-confidence data for: "${message}".

**Action Steps**:
- Verify the topic exists in your uploaded files.
- Use a specific SLO code (e.g., S8a5).
- If files were just uploaded, click **Sync Neural Nodes** in the Library.`);
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
- Use ONLY the provided MEMORY_VAULT for curriculum content.
- If specific data is missing: Explicitly state "DATA_UNAVAILABLE".
- Citation format: "According to [Memory Node X]..."
- Identity: You are Pedagogy Master v2.0. Focus on SLO-first alignment.
- Style: Markdown headers (1., 1.1), tables, bullet points. NO BOLD HEADINGS.`;

    const synthesisPrompt = `
# MEMORY_VAULT (Active Context):
${contextVault}

# TEACHER QUERY:
"${message}"

Synthesize a response following the Pedagogy Master v2.0 logic. Reference all SLOs in [brackets].
`;

    const streamResponse = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
      config: {
        systemInstruction,
        temperature: 0.1, // High precision for curriculum alignment
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
