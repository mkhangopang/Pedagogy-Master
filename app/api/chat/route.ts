import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks } from '../../../lib/rag/retriever';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';

/**
 * GROUNDED CHAT ENGINE
 * Leverages persistent RAG memory to provide context-aware synthesis.
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

    // 1. Identify context (selected documents)
    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_selected', true);
    
    const documentIds = selectedDocs?.map(d => d.id) || [];

    if (documentIds.length === 0) {
      return new Response(`📚 Active context required. Please select at least one curriculum document in your Library.`);
    }

    // 2. Semantic Memory Retrieval
    const retrievedChunks = await retrieveRelevantChunks(
      message, 
      documentIds, 
      supabase, 
      10, 
      priorityDocumentId
    );

    // 3. Verify grounded data
    if (retrievedChunks.length === 0) {
      return new Response(`DATA_UNAVAILABLE: Your current query doesn't match the curriculum data in your selected documents. Please try a different pedagogical keyword or check your document selection.`);
    }

    // 4. Synthesis Prompt Generation
    const contextVault = retrievedChunks.map((c, i) => (
      `### [MEMORY_${i+1}] (Source: ${c.pageNumber || 'N/A'}, SLOs: ${c.sloCodes.join(', ') || 'N/A'})
      ${c.text}`
    )).join('\n\n');

    // Initialize AI per coding guidelines
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `You are Pedagogy Master AI.
Strict Directive: Answer ONLY using the curriculum data in the MEMORY_VAULT.

Operational Rules:
- If info is missing, say "DATA_UNAVAILABLE".
- Cite memories used: (e.g., "According to Memory 2...").
- Tone: Professional pedagogical consultant.
- Format: Structured Markdown. NO BOLD HEADINGS.`;

    const prompt = `
# MEMORY_VAULT (Curriculum Data):
${contextVault}

# USER TEACHER QUERY:
"${message}"

Synthesize a professional response based strictly on the curriculum data above.
`;

    const streamResponse = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
          controller.enqueue(encoder.encode("\n\n[Synthesis Interrupted]"));
        } finally {
          controller.close();
        }
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error('[Chat API Error]:', error);
    return NextResponse.json({ error: 'Curriculum retrieval failure.' }, { status: 500 });
  }
}
