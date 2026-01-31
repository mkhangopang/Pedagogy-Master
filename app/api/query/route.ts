import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { getSynthesizer } from '../../../lib/ai/synthesizer-core';
import { generateEmbedding } from '../../../lib/rag/embeddings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SMART RAG INFERENCE NODE (v1.0)
 * Stage 1: Exact SLO Lookup
 * Stage 2: Vector Semantic Search
 * Stage 3: Neural Synthesis
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { query, documentId } = await req.json();
    if (!query) return NextResponse.json({ error: 'Query required' }, { status: 400 });

    const supabase = getSupabaseServerClient(token);
    let context = "";
    let searchMethod = "semantic";

    // 🔍 STEP 1: Exact SLO Extraction
    const sloMatch = query.match(/[BS]-\d{2}-[A-Z]-\d{2}/i);
    const sloCode = sloMatch ? sloMatch[0].toUpperCase() : null;

    if (sloCode) {
      console.log(`[Query] Exact SLO detected: ${sloCode}`);
      const { data: exactChunks } = await supabase
        .from('document_chunks')
        .select('*')
        .contains('slo_codes', [sloCode])
        .eq('document_id', documentId)
        .limit(1);

      if (exactChunks && exactChunks.length > 0) {
        context = exactChunks[0].chunk_text;
        searchMethod = "exact_slo";
      }
    }

    // 🔍 STEP 2: Semantic Vector Search (Fallback or Hybrid)
    if (!context) {
      const embedding = await generateEmbedding(query);
      const { data: similarChunks, error: rpcError } = await supabase.rpc('hybrid_search_chunks_v3', {
        query_text: query,
        query_embedding: embedding,
        match_count: 5,
        filter_document_ids: [documentId]
      });

      if (similarChunks && similarChunks.length > 0) {
        context = similarChunks.map((c: any) => c.chunk_text).join('\n---\n');
      }
    }

    if (!context) {
      return NextResponse.json({ error: "No relevant curriculum context found." }, { status: 404 });
    }

    // 🧠 STEP 3: Neural Synthesis
    const synth = getSynthesizer();
    const result = await synth.synthesize(`
Based on the following curriculum context, answer the user's question accurately.
CONTEXT:
${context}

USER QUESTION:
"${query}"

RULES:
- Answer ONLY using the context.
- Quote verbatim if a specific standard is found.
- If unsure, state the information is missing from the vault.
`, { systemPrompt: 'You are a helpful curriculum assistant. Answer based only on provided context.' });

    return NextResponse.json({
      success: true,
      answer: result.text,
      provider: result.provider,
      searchMethod,
      contextPreview: context.substring(0, 500) + '...'
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}