import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks, retrieveChunksForSLO } from '../../../lib/rag/retriever';
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

    // 1. Identify currently selected curriculum context
    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_selected', true);
    
    const documentIds = selectedDocs?.map(d => d.id) || [];

    // 2. Hybrid RAG Retrieval (SLO Detection + Neural Search)
    let retrievedChunks = [];
    
    if (documentIds.length > 0) {
      // 2a. Detect SLO pattern (e.g., "s7 a5", "S7a5", "S-7-a-5")
      // This helps solve the "DATA_UNAVAILABLE" issue for specific curriculum codes.
      const sloPattern = /\b([a-z])\s*(\d{1,2})\s*([a-z])\s*(\d{1,2})\b/i;
      const sloMatch = message.match(sloPattern);
      
      if (sloMatch) {
        const sloCode = sloMatch[0].replace(/\s+/g, '').toUpperCase();
        console.log(`[Chat API] Detected SLO code in query: ${sloCode}. Running precision lookup.`);
        const directChunks = await retrieveChunksForSLO(sloCode, documentIds, supabase);
        if (directChunks.length > 0) {
          retrievedChunks.push(...directChunks);
        }
      }
      
      // 2b. Neural Semantic Search (Global context matching)
      const neuralChunks = await retrieveRelevantChunks(message, documentIds, supabase, 5, priorityDocumentId);
      retrievedChunks.push(...neuralChunks);
      
      // Deduplicate results by chunk ID to ensure clean context
      const seenIds = new Set();
      retrievedChunks = retrievedChunks.filter(c => {
        if (seenIds.has(c.id)) return false;
        seenIds.add(c.id);
        return true;
      });
    }

    let retrievedContext = "";
    if (retrievedChunks.length > 0) {
      retrievedContext = retrievedChunks.map((c, i) => `[Context Segment ${i+1}${c.sectionTitle ? `: ${c.sectionTitle}` : ''}]\n${c.text}`).join('\n\n');
    }

    // 3. Grounding Verification
    // If no information is found in selected docs, provide a helpful pedagogical fallback guidance.
    if (!retrievedContext) {
      return new Response("DATA_UNAVAILABLE: I couldn't find any specific information in your currently selected curriculum documents to address this request. \n\nTo help me assist you better:\n1. Ensure the relevant documents are uploaded in the Library.\n2. Verify they are 'Selected' (checked) in the Library or the Chat sidebar.\n3. Try re-indexing the document if it was recently uploaded.");
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
        temperature: 0.1, // Precision temperature for strict grounding
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