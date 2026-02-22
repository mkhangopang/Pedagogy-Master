import { SupabaseClient } from '@supabase/supabase-js';
import { neuralGrid } from './model-orchestrator';
import type { TaskType } from './model-orchestrator';
import { retrieveRelevantChunks } from '../rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../rag/slo-extractor';
import { classifyIntent } from './intent-classifier';
import { kv } from '../kv';
import { Buffer } from 'buffer';

/**
 * MULTI-STAGE RETRIEVAL CASCADE (v126.1)
 * T1: Redis Cache | T2: Intent Routing | T3: Surgical Match | T4: Semantic Hybrid | T5: Self-Eval Log
 */
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
  
  // 1. INTENT CLASSIFICATION (Gemini 3 Flash)
  const intentData = await classifyIntent(userPrompt);

  // 2. CACHE LOOKUP (Upstash Redis)
  const cacheKey = `synth:${Buffer.from(userPrompt).toString('base64').substring(0, 40)}`;
  const cached = await kv.get<string>(cacheKey);
  if (cached) return { text: cached, provider: 'Neural Cache', metadata: { cached: true } };

  // 3. RETRIEVAL CASCADE
  let vaultContent = "";
  let isGrounded = false;
  let topChunkIds: string[] = [];
  let sourceDocName = "";
  
  const { data: activeDocs } = await supabase.from('documents')
    .select('id, name, authority, subject, grade_level, master_md_dialect')
    .eq('id', priorityDocumentId || 'dummy_fail');

  const activeDoc = activeDocs?.[0];

  if (activeDoc) {
    sourceDocName = activeDoc.name;
    // Stage A: Surgical Code Match (Regex precision)
    const codes = extractSLOCodes(userPrompt);
    if (codes.length > 0) {
      const { data: sloMatch } = await supabase.from('document_chunks')
        .select('id, chunk_text')
        .contains('slo_codes', [normalizeSLO(codes[0].code)])
        .eq('document_id', activeDoc.id)
        .limit(1);
      
      if (sloMatch?.[0]) {
        vaultContent = `### SURGICAL_VAULT_EXTRACT\n${sloMatch[0].chunk_text}`;
        topChunkIds = [sloMatch[0].id];
        isGrounded = true;
      }
    }

    // Stage B: Hybrid Semantic (Vector + FTS fallback)
    if (!isGrounded) {
      const chunks = await retrieveRelevantChunks({
        query: userPrompt,
        documentIds: [activeDoc.id],
        supabase,
        matchCount: 8,
        dialect: activeDoc.master_md_dialect
      });
      vaultContent = chunks.map(c => c.chunk_text).join('\n---\n');
      topChunkIds = chunks.map(c => c.chunk_id);
      isGrounded = chunks.length > 0;
    }
  }

  // 4. NEURAL SYNTHESIS (Complexity-Aware Routing)
  const systemInstruction = customSystem || "You are the Pedagogy Master AI.";
  const finalPrompt = `
<CONTEXT>
INTENT: ${intentData.intent} | COMPLEXITY: ${intentData.complexity}
${adaptiveContext || ''}
</CONTEXT>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: Use General Pedagogical Knowledge]'}
</AUTHORITATIVE_VAULT>

USER_QUERY: "${userPrompt}"`;

  // Add comment above each fix
  // Fix: Wrapped positional arguments into an options object to resolve the "Expected 1-2 arguments, but got 7" error
  // REPLACE WITH:
const taskMap: Record<string, TaskType> = {
  'master_plan':     'LESSON_PLAN',
  'neural_quiz':     'QUIZ_GENERATE',
  'fidelity_rubric': 'RUBRIC_GENERATE',
  'audit_tagger':    'AUDIT_TAG',
  'chat_tutor':      'CHAT_LOOKUP',
  'bloom_tag':       'BLOOM_TAG',
};

const gridTask: TaskType = taskMap[toolType || ''] ||
  (intentData.complexity >= 3 ? 'LESSON_PLAN' : 'CHAT_LOOKUP');

const gridResult = await neuralGrid.execute(finalPrompt, gridTask, {
  systemPrompt: systemInstruction,
  temperature: intentData.complexity >= 3 ? 0.3 : 0.1,
  maxTokens: intentData.complexity >= 3 ? 6144 : 2048,
});

const result = {
  text: gridResult.text,
  provider: `${gridResult.provider}/${gridResult.modelUsed}`,
};

  // 5. OBSERVABILITY & CACHING
  const latency = Date.now() - start;
  
  // Async log to retrieval_logs for analytics
  supabase.from('retrieval_logs').insert({
    user_id: userId,
    query_text: userPrompt,
    top_chunk_ids: topChunkIds,
    confidence_score: isGrounded ? 0.95 : 0.4,
    latency_ms: latency,
    provider_used: result.provider
  }).then();

  // Only cache stable, non-creative lookups
  if (intentData.complexity < 3 && !userPrompt.includes('create')) {
    await kv.set(cacheKey, result.text, 3600);
  }

  return {
    text: result.text,
    provider: result.provider,
    metadata: { isGrounded, sourceDocument: sourceDocName, intent: intentData.intent, latency, chunkCount: topChunkIds.length }
  };
}
