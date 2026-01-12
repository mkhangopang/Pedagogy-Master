
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks, RetrievedChunk } from '../../../lib/rag/retriever';
import { GoogleGenAI } from '@google/genai';
import { DEFAULT_MASTER_PROMPT, NUCLEAR_GROUNDING_DIRECTIVE } from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * NEURAL BRAIN CHAT ENGINE (v2.1)
 * Orchestrates pedagogical grounding with the "Pedagogy Master" core persona.
 * Updated: Hybrid Fallback Logic for general queries.
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

    // 2. Identification of context
    const { data: allDocs } = await supabase
      .from('documents')
      .select('id, name, rag_indexed')
      .eq('user_id', user.id);

    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_selected', true);
    
    let documentIds = selectedDocs?.map(d => d.id) || [];
    const hasLibrary = allDocs && allDocs.length > 0;

    // 3. Neural Semantic Memory Retrieval
    let retrievedChunks: RetrievedChunk[] = [];
    if (hasLibrary) {
      // If no docs selected, search across all docs in the library
      const targetIds = documentIds.length > 0 ? documentIds : (allDocs?.map(d => d.id) || []);
      retrievedChunks = await retrieveRelevantChunks(
        message, 
        targetIds, 
        supabase, 
        12, 
        priorityDocumentId
      );
    }

    const isGrounded = retrievedChunks.length > 0;

    // 4. Gemini Synthesis Execution
    const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey });
    
    // Construct Dynamic System Instruction
    let systemInstruction = `${activeMasterPrompt}\n\n`;
    
    if (isGrounded) {
      systemInstruction += `${NUCLEAR_GROUNDING_DIRECTIVE}\nSTRICT_GROUNDING: Use the provided MEMORY_VAULT. Cite as [Memory Node X].`;
    } else {
      systemInstruction += `GENERAL_PEDAGOGY_MODE: The user's query did not match specific curriculum assets. Provide a world-class pedagogical response using your general training data, but add a brief note that this is not grounded in their uploaded documents.`;
    }

    systemInstruction += `\n\nStyle: Markdown headers (1., 1.1), tables, bullet points. NO BOLD HEADINGS.`;

    // 5. Build Synthesis Prompt
    let contextVault = "";
    if (isGrounded) {
      contextVault = retrievedChunks.map((c, i) => (
        `### [MEMORY_NODE_${i+1}] (Source: ${c.pageNumber || 'N/A'}, SLOs: ${c.sloCodes.join(', ') || 'N/A'})
        ${c.text}`
      )).join('\n\n');
    }

    const synthesisPrompt = isGrounded 
      ? `# MEMORY_VAULT (Matched Context):\n${contextVault}\n\n# TEACHER QUERY:\n"${message}"\n\nSynthesize response referencing nodes.`
      : `# TEACHER QUERY (No Document Matches Found):\n"${message}"\n\nProvide general pedagogical assistance.`;

    const streamResponse = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
      config: {
        systemInstruction,
        temperature: isGrounded ? 0.1 : 0.7,
      }
    });

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        try {
          if (!isGrounded && hasLibrary) {
            controller.enqueue(encoder.encode("> *Note: No direct matches found in your curriculum library. Providing general pedagogical guidance.*\n\n"));
          } else if (!hasLibrary) {
             controller.enqueue(encoder.encode("> *Note: Your library is empty. Please upload documents to enable curriculum-grounded responses.*\n\n"));
          }

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
