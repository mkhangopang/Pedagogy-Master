
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks } from '../../../lib/rag/retriever';
import { GoogleGenAI } from '@google/genai';
import { DEFAULT_MASTER_PROMPT, NUCLEAR_GROUNDING_DIRECTIVE } from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GROUNDED CHAT ENGINE
 * Leverages persistent RAG memory and the Neural Brain Logic.
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

    // 1. Fetch active Neural Brain Logic from DB
    const { data: brainData } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const masterPrompt = brainData?.master_prompt || DEFAULT_MASTER_PROMPT;

    // 2. Identify context (selected documents)
    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_selected', true);
    
    const documentIds = selectedDocs?.map(d => d.id) || [];

    if (documentIds.length === 0) {
      return new Response(`📚 Active context required. Please select at least one curriculum document in your Library.`);
    }

    // 3. Semantic Memory Retrieval
    const retrievedChunks = await retrieveRelevantChunks(
      message, 
      documentIds, 
      supabase, 
      12, // Increased for better pedagogical context
      priorityDocumentId
    );

    // 4. Verify grounded data
    if (retrievedChunks.length === 0) {
      return new Response(`DATA_UNAVAILABLE: I searched your ${selectedDocs?.length} selected curriculum assets but found no relevant content for: "${message}".`);
    }

    // 5. Synthesis Prompt Generation
    const contextVault = retrievedChunks.map((c, i) => (
      `### [MEMORY_${i+1}] (Source: ${c.pageNumber || 'N/A'}, SLOs: ${c.sloCodes.join(', ') || 'N/A'})
      ${c.text}`
    )).join('\n\n');

    const apiKey = process.env.API_KEY || (process.env as any).GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey });
    
    // Combine User's Neural Brain logic with strict RAG directives
    const systemInstruction = `${masterPrompt}

${NUCLEAR_GROUNDING_DIRECTIVE}

Strict Directive: Answer ONLY using the curriculum data in the MEMORY_VAULT.
If info is missing from the vault, say "DATA_UNAVAILABLE".`;

    const prompt = `
# MEMORY_VAULT (Curriculum Data):
${contextVault}

# USER TEACHER QUERY:
"${message}"

Synthesize a professional response based strictly on the curriculum data above. Follow all formatting rules in the Master Prompt.
`;

    const streamResponse = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        temperature: 0.1, // High precision grounding
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
          console.error('[Chat Stream Error]:', err);
          controller.enqueue(encoder.encode("\n\n[Synthesis Interrupted: Remote Node Error]"));
        } finally {
          controller.close();
        }
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error('[Chat API Error]:', error);
    return NextResponse.json({ error: `Synthesis failure: ${error.message}` }, { status: 500 });
  }
}
