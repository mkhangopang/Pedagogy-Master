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
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_selected', true);
    
    const documentIds = selectedDocs?.map(d => d.id) || [];

    // 2. Multi-Layer Retrieval (Precision SLO + Semantic Neural)
    let retrievedChunks = [];
    
    if (documentIds.length > 0) {
      // 2a. Precision SLO Extraction (Matches 's8 a5', 'S8A5', etc.)
      const sloPattern = /\b([a-z])\s*(\d{1,2})\s*([a-z])\s*(\d{1,2})\b/gi;
      const sloMatches = Array.from(message.matchAll(sloPattern));
      
      for (const match of sloMatches) {
        const normalizedCode = match[0].replace(/[\s-]/g, '').toUpperCase();
        console.log(`[Chat Node] High-Precision Lookup: ${normalizedCode}`);
        const exactMatchChunks = await retrieveChunksForSLO(normalizedCode, documentIds, supabase);
        retrievedChunks.push(...exactMatchChunks);
      }
      
      // 2b. Semantic Neural Search (For context and general queries)
      const semanticChunks = await retrieveRelevantChunks(message, documentIds, supabase, 5, priorityDocumentId);
      retrievedChunks.push(...semanticChunks);
      
      // Deduplicate results by chunk ID
      const seenIds = new Set();
      retrievedChunks = retrievedChunks.filter(c => {
        if (seenIds.has(c.id)) return false;
        seenIds.add(c.id);
        return true;
      });
    }

    let retrievedContext = "";
    if (retrievedChunks.length > 0) {
      retrievedContext = retrievedChunks.map((c, i) => {
        const header = `[Source Asset ${i+1}: ${c.sectionTitle || 'Curriculum Segment'}]`;
        return `${header}\n${c.text}`;
      }).join('\n\n');
    }

    // 3. Grounding Verification
    if (!retrievedContext) {
      const activeDocsNames = selectedDocs?.map(d => d.name).join(', ') || 'No documents';
      return new Response(`DATA_UNAVAILABLE: I searched your selected curriculum assets (${activeDocsNames}) but couldn't find information about "${message}". \n\nTips:\n- Ensure the correct document is selected in the Sidebar.\n- Verify the SLO code format matches your document.\n- Try re-indexing your library from the Brain Control panel.`);
    }

    // 4. Gemini Neural Synthesis
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `You are the Pedagogy Master AI, an elite instructional designer.
Your primary directive is to use ONLY the curriculum context provided in the ASSET_VAULT.

STRICT GROUNDING PROTOCOL:
1. Ground every statement in the ASSET_VAULT.
2. If the user asks for a lesson plan, rubric, or activity, base it strictly on the learning objectives found in the vault.
3. Cite sources: "Based on [Source Asset Name]..."
4. Maintain a professional, actionable pedagogical tone.
5. If you cannot find the specific SLO text, state what is available instead.`;

    const prompt = `
# ASSET_VAULT (CURRICULUM CONTEXT):
${retrievedContext}

# TEACHER QUERY:
${message}
`;

    const streamResponse = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        temperature: 0.1, // Precision temperature
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
          console.error('[Synthesis Stream Break]:', err);
          controller.enqueue(encoder.encode("\n\n[Synthesis Interrupted]"));
        } finally {
          controller.close();
        }
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error('[Chat API Fatal]:', error);
    return NextResponse.json({ error: 'The synthesis engine encountered a fatal bottleneck.' }, { status: 500 });
  }
}
