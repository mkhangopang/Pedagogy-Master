import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { getSynthesizer } from '../../../lib/ai/synthesizer-core';
import { RAGPipeline } from '../../../lib/rag/rag-pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SMART RAG INFERENCE NODE (v7.0 - PGVECTOR POWERED)
 * Stage 1: Vector Search & Atomic SLO Context via RAGPipeline
 * Stage 2: Grounded Synthesis with Citation Tracking
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { query, documentId } = await req.json();
    if (!query) return NextResponse.json({ error: 'Query required' }, { status: 400 });

    const supabase = getSupabaseServerClient(token);
    const docIds = documentId ? [documentId] : [];

    // Retrieve grounded context via pgvector pipeline
    const groundedResult = await RAGPipeline.buildGroundedContext({
      query,
      documentIds: docIds,
      supabase,
      matchCount: 8
    });

    if (!groundedResult.isGrounded) {
      return NextResponse.json({ 
        error: "No relevant curriculum context found in current vault node.",
        suggestion: "Ensure the document is selected and vectorized in your Library."
      }, { status: 404 });
    }

    // Grounded Synthesis
    const synth = getSynthesizer();
    const result = await synth.synthesize(`
Based on the following authoritative curriculum context, answer the educator's question with 100% pedagogical fidelity.

${groundedResult.groundedText}

USER QUESTION:
"${query}"

RULES:
- Answer accurately and thoroughly using ONLY the provided curriculum context.
- Explicitly cite verbatim SLO codes (e.g. M09A01, B09A02) wherever applicable.
- Structure explanations with clear pedagogical steps, learning targets, and cognitive taxonomy levels.
- Do not invent standards not present in the provided context.
`, { 
      systemPrompt: 'You are an authoritative Curriculum Specialist and Pedagogical Architect. Provide precise, standards-aligned instructional guidance grounded in the provided curriculum.',
      complexity: 2 
    });

    return NextResponse.json({
      success: true,
      answer: result.text,
      provider: result.provider,
      searchMethod: 'supabase_pgvector_hybrid',
      contextPreview: groundedResult.groundedText.substring(0, 350) + '...',
      retrievedChunksCount: groundedResult.retrievedChunks.length,
      matchedSlosCount: groundedResult.matchedSlos.length,
      sourceDocuments: groundedResult.sourceDocumentNames
    });

  } catch (error: any) {
    console.error("❌ [Query Node Fault]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
