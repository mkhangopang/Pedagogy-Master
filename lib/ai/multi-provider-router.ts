import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks } from '../rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../rag/slo-extractor';
import { classifyIntent } from './intent-classifier';
import { kv } from '../kv';
import { createHash } from 'crypto';

// Tools that MUST have a document selected to produce real (non-hallucinated) output.
const DOC_REQUIRED_TOOLS = new Set(['audit_tagger']);
// Tools where a document strongly improves quality but is not strictly required.
const DOC_PREFERRED_TOOLS = new Set(['neural_quiz', 'fidelity_rubric', 'master_plan']);

export async function generateAIResponse(
  userPrompt: string,
  history: any[],
  userId: string,
  supabase: SupabaseClient,
  adaptiveContext?: string,
  overrideDocPart?: any,
  toolType?: string,
  customSystem?: string,
  priorityDocumentId?: string
): Promise<{ text: string; provider: string; metadata?: any }> {

  const start = Date.now();

  // 1. Atomic Quota Enforcement
  const { data: quotaOk, error: quotaErr } = await supabase.rpc(
    'increment_query_count',
    { p_user_id: userId }
  );
  if (quotaErr || quotaOk === false) {
    throw new Error('QUOTA_EXCEEDED: Upgrade your plan to continue generating content.');
  }

  // 2. Hard check: doc-required tools must have a document
  if (toolType && DOC_REQUIRED_TOOLS.has(toolType) && !priorityDocumentId) {
    return {
      text: `## ⚠️ Curriculum Document Required\n\nThe **Audit Tagger** tool performs SLO-level curriculum analysis and requires an uploaded curriculum document to work correctly.\n\nPlease:\n1. Go to the **Documents** section\n2. Upload your curriculum PDF (e.g., Federal Board Biology Grade 9)\n3. Wait for processing to complete (green checkmark)\n4. Return here and select the document\n\nWithout a real document, any audit output would be fabricated — which defeats the purpose of standards alignment.`,
      provider: 'System Guard',
      metadata: { isGrounded: false, blocked: true }
    };
  }

  // 3. Intent Classification (rule-based only — no AI call)
  const intentData = await classifyIntent(userPrompt);

  // 4. Cache Lookup — KEY MUST include documentId to prevent stale hallucinated responses
  //    being served after a user selects a document.
  const cacheKeyInput = `${userPrompt}|doc:${priorityDocumentId || 'none'}`;
  const cacheKey = `synth:${createHash('sha256').update(cacheKeyInput).digest('hex')}`;
  const cached = await kv.get<string>(cacheKey);
  if (cached) return { text: cached, provider: 'Neural Cache', metadata: { cached: true } };

  // 5. Document Retrieval
  let vaultContent = '';
  let isGrounded = false;
  let topChunkIds: string[] = [];
  let sourceDocName = '';

  if (priorityDocumentId) {
    const { data: activeDoc } = await supabase
      .from('documents')
      .select('id, name, authority, subject, grade_level, master_md_dialect')
      .eq('id', priorityDocumentId)
      .single();

    if (activeDoc) {
      sourceDocName = activeDoc.name;

      const codes = extractSLOCodes(userPrompt);
      if (codes.length > 0) {
        const { data: sloMatch } = await supabase
          .from('document_chunks')
          .select('id, chunk_text')
          .contains('slo_codes', [normalizeSLO(codes[0].code)])
          .eq('document_id', activeDoc.id)
          .limit(1);

        if (sloMatch?.[0]) {
          vaultContent = `### AUTHORITATIVE_SLO_EXTRACT (Exact Match)\nSource: ${activeDoc.name}\n\n${sloMatch[0].chunk_text}`;
          topChunkIds = [sloMatch[0].id];
          isGrounded = true;
        }
      }

      if (!isGrounded) {
        const chunks = await retrieveRelevantChunks({
          query: userPrompt,
          documentIds: [activeDoc.id],
          supabase,
          matchCount: 8,
          dialect: activeDoc.master_md_dialect
        });
        if (chunks.length > 0) {
          vaultContent = `### AUTHORITATIVE_CURRICULUM_EXTRACTS\nSource: ${activeDoc.name}\n\n` +
            chunks.map((c, i) => `--- Chunk ${i + 1} ---\n${c.chunk_text}`).join('\n\n');
          topChunkIds = chunks.map(c => c.chunk_id);
          isGrounded = true;
        }
      }
    }
  }

  // 6. Build the grounding instruction for the AI
  //    Be explicit about what "no document" means — don't silently allow hallucination.
  let vaultInstruction: string;
  if (isGrounded) {
    vaultInstruction = `
<AUTHORITATIVE_VAULT status="GROUNDED" source="${sourceDocName}">
${vaultContent}
</AUTHORITATIVE_VAULT>

CRITICAL GROUNDING RULE: Your response MUST be anchored to the curriculum content above.
- For SLO codes, objectives, and standards: only cite what appears in the vault.
- You may enrich with pedagogical frameworks (Bloom's, Hunter, 5E) but the CONTENT must come from the vault.
- If the vault does not contain enough detail for a request, say so explicitly rather than inventing content.`;
  } else if (priorityDocumentId) {
    // Document selected but retrieval returned nothing — warn the AI
    vaultInstruction = `
<AUTHORITATIVE_VAULT status="RETRIEVAL_FAILED">
No relevant chunks were found for this query in the selected document.
</AUTHORITATIVE_VAULT>

IMPORTANT: The user has selected a curriculum document but no matching content was found.
Respond with general pedagogical guidance and clearly state: "I could not find this specific content in your uploaded curriculum. This response is based on general knowledge."
Do NOT invent SLO codes, standards, or curriculum-specific details.`;
  } else {
    // No document at all
    const needsDocWarning = toolType && DOC_PREFERRED_TOOLS.has(toolType);
    vaultInstruction = `
<AUTHORITATIVE_VAULT status="NO_DOCUMENT_SELECTED">
No curriculum document is active.
</AUTHORITATIVE_VAULT>

${needsDocWarning
  ? `NOTE: This tool works best with an uploaded curriculum document. The response below is based on general pedagogical knowledge and standard frameworks. If you want curriculum-specific output (real SLO codes, board-aligned standards), please upload and select a curriculum PDF first.`
  : `Respond using established pedagogical frameworks and general educational best practices.`
}`;
  }

  // 7. Neural Synthesis
  const systemInstruction = customSystem || 'You are the Pedagogy Master AI.';
  const finalPrompt = `
<CONTEXT>
INTENT: ${intentData.intent} | COMPLEXITY: ${intentData.complexity}
TOOL: ${toolType || 'general'}
${adaptiveContext || ''}
</CONTEXT>

${vaultInstruction}

USER_QUERY: "${userPrompt}"`;

  const result = await synthesize(finalPrompt, {
    history: history.slice(-6),
    isGrounded,
    suggestedProvider: intentData.suggestedProvider,
    systemPrompt: systemInstruction,
    complexity: intentData.complexity
  });

  const latency = Date.now() - start;

  // 8. Logging
  supabase.from('retrieval_logs').insert({
    user_id: userId,
    query_text: userPrompt,
    top_chunk_ids: topChunkIds,
    confidence_score: isGrounded ? 0.95 : 0.4,
    latency_ms: latency,
    provider_used: result.provider
  }).then();

  // 9. Selective Caching — never cache doc-dependent responses unless grounded
  const isCacheable =
    intentData.complexity < 3 &&
    intentData.intent === 'lookup' &&
    !userPrompt.toLowerCase().includes('create') &&
    !userPrompt.toLowerCase().includes('generate') &&
    !userPrompt.toLowerCase().includes('write') &&
    // Only cache grounded responses or pure general-knowledge lookups
    (isGrounded || !priorityDocumentId);

  if (isCacheable) {
    await kv.set(cacheKey, result.text, 3600);
  }

  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      isGrounded,
      sourceDocument: sourceDocName,
      intent: intentData.intent,
      latency,
      chunkCount: topChunkIds.length
    }
  };
}
