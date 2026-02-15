import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase';
import { getSynthesizer } from '../../../lib/ai/synthesizer-core';
import { generateEmbedding } from '../../../lib/rag/embeddings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SMART RAG INFERENCE NODE (v6.2)
 * Stage 1: Exact SLO Lookup (Regex extraction)
 * Stage 2: Hybrid Semantic Search (v6 RPC)
 * Stage 3: Deterministic Synthesis
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

    // 🔍 STEP 1: Exact SLO Extraction (Resilient to B09 vs B-09)
    const sloMatch = query.match(/[A-Z]\d{2}[A-Z]\d{2}/i);
    const sloCode = sloMatch ? sloMatch[0].toUpperCase().replace(/-/g, '') : null;

    if (sloCode) {
      const { data: exactChunks } = await supabase
        .from('document_chunks')
        .select('chunk_text')
        .contains('slo_codes', [sloCode])
        .eq('document_id', documentId)
        .limit(1);

      if (exactChunks && exactChunks.length > 0) {
        context = exactChunks[0].chunk_text;
        searchMethod = "exact_slo_match";
      }
    }

    // 🔍 STEP 2: Hybrid Vector Search v6
    if (!context) {
      const embedding = await generateEmbedding(query);
      const { data: similarChunks, error: rpcError } = await supabase.rpc('hybrid_search_chunks_v6', {
        query_text: query,
        query_embedding: embedding,
        match_count: 8,
        filter_document_ids: [documentId]
      });

      if (rpcError) throw new Error(`RPC_V6_FAULT: ${rpcError.message}`);
      
      if (similarChunks && similarChunks.length > 0) {
        context = similarChunks.map((c: any) => c.chunk_text).join('\n---\n');
      }
    }

    if (!context) {
      return NextResponse.json({ error: "No relevant curriculum context found in current vault node." }, { status: 404 });
    }

    // 🧠 STEP 3: Deterministic Synthesis
    const synth = getSynthesizer();
    const result = await synth.synthesize(`
Based on the following curriculum context, answer the educator's question with 100% fidelity.
CONTEXT:
${context}

USER QUESTION:
"${query}"

RULES:
- Answer ONLY using provided context.
- Use verbatim SLO codes.
- Do not hallucinate standards not present in the vault.
`, { systemPrompt: 'You are a high-fidelity curriculum assistant. Answer using ONLY provided context.', complexity: 2 });

    return NextResponse.json({
      success: true,
      answer: result.text,
      provider: result.provider,
      searchMethod,
      contextPreview: context.substring(0, 300) + '...'
    });

  } catch (error: any) {
    console.error("❌ [Query Node Fault]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}