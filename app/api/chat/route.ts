import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks, RetrievedChunk } from '../../../lib/rag/retriever';
import { GoogleGenAI } from '@google/genai';
import { DEFAULT_MASTER_PROMPT, NUCLEAR_GROUNDING_DIRECTIVE } from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * NEURAL BRAIN CHAT ENGINE (v2.2)
 * Enhanced grounding with strict prompt isolation.
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
    if (documentIds.length === 0 && allDocs && allDocs.length > 0) {
      documentIds = allDocs.map(d => d.id);
    }
    
    const hasLibrary = allDocs && allDocs.length > 0;

    // 3. Neural Semantic Memory Retrieval
    let retrievedChunks: RetrievedChunk[] = [];
    if (documentIds.length > 0) {
      console.log(`📡 [Chat] Searching RAG nodes for: ${documentIds.length} assets`);
      
      retrievedChunks = await retrieveRelevantChunks(
        message, 
        documentIds, 
        supabase, 
        12, 
        priorityDocumentId
      );
    }

    const isGrounded = retrievedChunks.length > 0;

    // 4. Gemini Synthesis Execution
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    // Construct System Instruction with dynamic grounding modes
    let systemInstruction = `${activeMasterPrompt}\n\n`;
    
    if (isGrounded) {
      systemInstruction += `${NUCLEAR_GROUNDING_DIRECTIVE}\n`;
      systemInstruction += `STRICT_PEDAGOGY: Use provided <MEMORY_VAULT> as the ONLY source of truth. Reference nodes as [Node X]. If the exact SLO detail is missing from the vault, explicitly state "INFO_NOT_IN_VAULT".`;
    } else {
      systemInstruction += `GENERAL_PEDAGOGY_MODE: User has no library matches. Provide expert educational advice using general knowledge. Mention that uploading documents would allow for curriculum-specific grounding.`;
    }

    systemInstruction += `\n\nFormat: Use 1., 1.1 headings. No bold headings.`;

    // 5. Build Synthesis Prompt with Isolated Context
    let contextVault = "";
    if (isGrounded) {
      contextVault = retrievedChunks.map((c, i) => (
        `[MEMORY_NODE_${i+1}] (Ref: ${c.pageNumber || 'p.?'}, SLOs: ${c.sloCodes.join(', ') || 'N/A'})\nTEXT: ${c.text}`
      )).join('\n\n---\n\n');
    }

    const synthesisPrompt = isGrounded 
      ? `<MEMORY_VAULT>\n${contextVault}\n</MEMORY_VAULT>\n\n# TEACHER_QUERY: "${message}"\n\nSynthesize the above context to answer the query. Be specific.`
      : `# TEACHER_QUERY: "${message}"\n\nNo curriculum matches were found in the library. Respond based on general educational principles.`;

    const streamResponse = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
      config: {
        systemInstruction,
        temperature: isGrounded ? 0.05 : 0.7, // Lower temp for grounded responses
      }
    });

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        try {
          if (isGrounded) {
            controller.enqueue(encoder.encode(`> *Neural Sync Active: Grounded in ${retrievedChunks.length} curriculum segments.*\n\n`));
          } else if (hasLibrary) {
            controller.enqueue(encoder.encode("> *Neural Grounding: No direct matches found in your library for this specific query. Providing general pedagogical guidance.*\n\n"));
          } else {
             controller.enqueue(encoder.encode("> *Note: Your library is empty. Upload documents to enable grounded responses.*\n\n"));
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