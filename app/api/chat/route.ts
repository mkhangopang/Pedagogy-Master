
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks, extractSLOCodes } from '../../../lib/rag/retriever';
import { synthesize } from '../../../lib/ai/synthesizer-core';
import { 
  DEFAULT_MASTER_PROMPT, 
  NUCLEAR_GROUNDING_DIRECTIVE 
} from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * PEDAGOGY MASTER CHAT ENGINE (v22.0 - PRODUCTION FIX)
 * Implements authoritative grounding for tool generation.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { message, toolType, history = [], priorityDocumentId } = body;

    const supabase = getSupabaseServerClient(token);

    // 1. Resolve selected document (Priority given to UI focus, then database selection)
    let selectedDocId = priorityDocumentId;
    if (!selectedDocId) {
      const { data: doc } = await supabase
        .from('documents')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_selected', true)
        .eq('rag_indexed', true)
        .single();
      selectedDocId = doc?.id;
    }

    if (!selectedDocId) {
      console.warn('⚠️ No active curriculum asset found for user:', user.id);
    }

    // 2. Retrieve curriculum context via RAG
    let retrievedChunks = [];
    if (selectedDocId) {
      retrievedChunks = await retrieveRelevantChunks({
        query: message,
        documentId: selectedDocId,
        supabase,
        matchCount: 5
      });
    }

    // 3. Build high-precision prompt
    let finalPrompt: string;
    const extractedSLOs = extractSLOCodes(message);

    if (retrievedChunks.length > 0) {
      const vaultContent = retrievedChunks
        .map((chunk, i) => `[SLO NODE ${i + 1}]\nSLO_CODES: ${chunk.slo_codes?.join(', ') || 'General'}\nOBJECTIVE: ${chunk.chunk_text.substring(0, 400)}\n---`)
        .join('\n');

      finalPrompt = `
${NUCLEAR_GROUNDING_DIRECTIVE}

${DEFAULT_MASTER_PROMPT}

<AUTHORITATIVE_VAULT>
${vaultContent}
</AUTHORITATIVE_VAULT>

TOOL REQUEST TYPE: ${toolType || 'pedagogical_synthesis'}
USER QUERY: ${message}

GENERATION INSTRUCTIONS:
- Use the SLO definitions in the vault as the basis for all generated content.
- CREATE a structured pedagogical tool (Lesson Plan, Quiz, or Rubric).
- DO NOT just summarize the document; SYNTHESIZE new material.
- Apply 5E Model and Bloom's Taxonomy.
`;
    } else {
      finalPrompt = `
${DEFAULT_MASTER_PROMPT}

⚡ Neural Note: No matching curriculum nodes found. Synthesizing using Global Pedagogical Standards.

TOOL REQUEST TYPE: ${toolType || 'general'}
USER QUERY: ${message}
`;
    }

    // 4. AI Synthesis call
    const result = await synthesize(
      finalPrompt,
      history,
      retrievedChunks.length > 0,
      [],
      'gemini',
      DEFAULT_MASTER_PROMPT
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        if (retrievedChunks.length > 0) {
          // Fix: encoder.encode should be used instead of encoder.enqueue
          controller.enqueue(encoder.encode(`> *🛡️ Neural Sync: Grounded in ${retrievedChunks.length} curriculum nodes for SLOs: ${extractedSLOs.join(', ') || 'Detected'}.*\n\n`));
        }
        controller.enqueue(encoder.encode(result.text));
        controller.enqueue(encoder.encode(`\n\n*Synthesis Node: ${result.provider}*`));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ Chat API Fatal Error:", error);
    return new Response(`Synthesis error: ${error.message || 'Grid connection lost'}.`, { status: 200 });
  }
}
