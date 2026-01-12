import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks } from '../../../lib/rag/retriever';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';

/**
 * GROUNDED SYNTHESIS ENGINE
 * Connects the user to the persistent curriculum memory.
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

    // 1. Verify selected curriculum context
    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_selected', true);
    
    const documentIds = selectedDocs?.map(d => d.id) || [];
    const documentNames = selectedDocs?.map(d => d.name) || [];

    if (documentIds.length === 0) {
      return new Response(`📚 Please activate a curriculum document in the library. I need persistent context to assist you accurately.`);
    }

    // 2. Persistent RAG Retrieval (Neural + Keyword)
    const retrievedChunks = await retrieveRelevantChunks(
      message, 
      documentIds, 
      supabase, 
      10, // Increased chunk limit for better synthesis
      priorityDocumentId
    );

    // 3. Context Verification
    if (retrievedChunks.length === 0) {
      return new Response(`DATA_UNAVAILABLE: I searched your persistent curriculum memory but found no relevant data for your query. 

Suggestions:
- Check if the document covers this specific topic.
- Try searching with different pedagogical keywords.
- Verify the document is fully indexed in the Library.`);
    }

    // 4. Grounded Prompt Assembly
    const contextVault = retrievedChunks.map((c, i) => (
      `### [MEMORY_SEGMENT_${i+1}] (Source: ${c.pageNumber || 'N/A'}, SLOs: ${c.sloCodes.join(', ') || 'General'})
      ${c.text}`
    )).join('\n\n');

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `You are Pedagogy Master AI.
Strict Rule: Answer ONLY using the curriculum memories provided in the MEMORY_VAULT.

OPERATIONAL PROTOCOL:
1. CITATION: Cite specific segments (e.g., "Based on Segment 4...").
2. SCOPE: If the info is not in the vault, say "DATA_UNAVAILABLE".
3. FORMATTING: Use professional, structured Markdown. No bold headings.
4. TONE: Expert pedagogical consultant.`;

    const prompt = `
# MEMORY_VAULT (Persistent Curriculum Data):
${contextVault}

# USER TEACHER QUERY:
"${message}"

Synthesize a grounded response based solely on the persistent memories above.
`;

    const streamResponse = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        temperature: 0.1, // Absolute precision
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
          controller.enqueue(encoder.encode("\n\n[Synthesis Node Disconnected]"));
        } finally {
          controller.close();
        }
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error('[Grounded Chat Error]:', error);
    return NextResponse.json({ error: 'Memory retrieval bottleneck.' }, { status: 500 });
  }
}
