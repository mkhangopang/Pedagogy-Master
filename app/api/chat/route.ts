import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks } from '../../../lib/rag/retriever';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';

/**
 * AI CHAT ENDPOINT (GROUNDED RAG)
 * Orchestrates curriculum document retrieval and context-aware synthesis.
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

    // 1. Identify currently selected curriculum context exclusively
    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_selected', true);
    
    const documentIds = selectedDocs?.map(d => d.id) || [];

    // 2. RAG Retrieval with Focused Priority
    let retrievedContext = "";
    if (documentIds.length > 0) {
      const chunks = await retrieveRelevantChunks(message, documentIds, supabase, 5, priorityDocumentId);
      if (chunks.length > 0) {
        retrievedContext = chunks.map((c, i) => `[Context Segment ${i+1}${c.sectionTitle ? `: ${c.sectionTitle}` : ''}]\n${c.text}`).join('\n\n');
      }
    }

    // 3. Grounding Verification
    if (!retrievedContext) {
      return new Response("DATA_UNAVAILABLE: I couldn't find any relevant information in your selected curriculum documents to answer this query. Please ensure your documents are uploaded, indexed, and selected in the Library.");
    }

    // 4. Gemini Neural Synthesis
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `You are the Pedagogy Master AI, an expert instructional designer and curriculum coach.
Your task is to assist the teacher using ONLY the curriculum context provided in the ASSET_VAULT.

STRICT GROUNDING RULES:
1. USE ONLY the provided context to answer the user's question. 
2. DO NOT use external general training knowledge.
3. If the context does not contain the necessary information, explicitly state that it is unavailable in the current curriculum.
4. Cite the source segments (e.g., "Based on Context Segment 1...").
5. Maintain a professional, supportive, and highly actionable tone.`;

    const prompt = `
# ASSET_VAULT (CURRICULUM CONTEXT):
${retrievedContext}

# TEACHER QUESTION:
${message}
`;

    const streamResponse = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        temperature: 0.1, // Low temperature ensures strictly grounded, deterministic responses.
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
          console.error('[Stream Synthesis Error]:', err);
          controller.enqueue(encoder.encode("\n\n[Synthesis Node Interrupted]"));
        } finally {
          controller.close();
        }
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error('[Chat API Route Fatal]:', error);
    return NextResponse.json({ error: error.message || 'Synthesis engine encountered a fatal exception.' }, { status: 500 });
  }
}
