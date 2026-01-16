import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks, extractSLOCodes, RetrievedChunk } from '../../../lib/rag/retriever';
import { synthesize } from '../../../lib/ai/synthesizer-core';
import { 
  DEFAULT_MASTER_PROMPT, 
  NUCLEAR_GROUNDING_DIRECTIVE 
} from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * PEDAGOGY MASTER CHAT ENGINE (v24.0 - PRODUCTION FIX)
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

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    console.log('💬 User query:', message);
    const supabase = getSupabaseServerClient(token);

    // 1. Resolve user's selected curriculum document
    const { data: selectedDoc, error: docError } = await supabase
      .from('documents')
      .select('id, name, file_path')
      .eq('user_id', user.id)
      .eq('is_selected', true)
      .eq('rag_indexed', true)
      .single();

    let retrievedChunks: RetrievedChunk[] = [];
    const docIdToUse = priorityDocumentId || selectedDoc?.id;

    if (docIdToUse) {
      // 2. Retrieve curriculum context via RAG
      retrievedChunks = await retrieveRelevantChunks({
        query: message,
        documentId: docIdToUse,
        supabase,
        matchCount: 5
      });
    }

    // 3. Build high-precision prompt
    let finalPrompt: string;
    const extractedSLOs = extractSLOCodes(message);

    if (retrievedChunks.length > 0) {
      // Build minimal SLO context
      const contextChunks = retrievedChunks.slice(0, 3);
      const sloContext = contextChunks.map((chunk, idx) => `
[SLO NODE ${idx + 1}]
SLO_CODES: ${chunk.slo_codes?.join(', ') || 'None'}
OBJECTIVE: ${chunk.chunk_text.substring(0, 400)}...
---
      `).join('\n');

      console.log('✅ Using', contextChunks.length, 'chunks for context');
      console.log('🎯 Priority SLOs:', extractedSLOs);

      finalPrompt = `
${NUCLEAR_GROUNDING_DIRECTIVE}

${DEFAULT_MASTER_PROMPT}

<AUTHORITATIVE_VAULT>
${sloContext}
</AUTHORITATIVE_VAULT>

TOOL REQUEST TYPE: ${toolType || 'pedagogical_synthesis'}
USER QUERY: ${message}

GENERATION INSTRUCTIONS:
- Use the SLO definitions in the vault above as your learning objectives.
- Generate a STRUCTURED pedagogical tool (not a document summary).
- Apply 5E Model, Bloom's Taxonomy, and UDL principles.
- Create NEW instructional content appropriate for the grade level.
`;
    } else {
      console.warn('⚠️ No matching curriculum nodes found or no document selected, using fallback');
      finalPrompt = `
${DEFAULT_MASTER_PROMPT}

⚡ Neural Note: No matching curriculum context found. Synthesizing using Global Pedagogical Standards.

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
          controller.enqueue(encoder.encode(`> *🛡️ Neural Sync: Grounded in curriculum for SLOs: ${extractedSLOs.join(', ') || 'Detected'}.*\n\n`));
        }
        controller.enqueue(encoder.encode(result.text));
        controller.enqueue(encoder.encode(`\n\n*Synthesis Node: ${result.provider}*`));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ Chat API Fatal Error:", error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), { status: 500 });
  }
}
