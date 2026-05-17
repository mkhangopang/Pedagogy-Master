import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize, synthesizeStream } from './synthesizer-core';
import { retrieveRelevantChunks } from '../rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../rag/slo-extractor';
import { classifyIntent } from './intent-classifier';
import { kv } from '../kv';
import { createHash } from 'crypto';

export async function* generateAIResponseStream(
  userPrompt: string,
  history: any[],
  userId: string,
  supabase: SupabaseClient,
  adaptiveContext?: string,
  overrideDocPart?: any,
  toolType?: string,
  customSystem?: string,
  priorityDocumentId?: string
): AsyncGenerator<string> {

  // 1. Atomic Quota Enforcement
  const { data: quotaOk, error: quotaErr } = await supabase.rpc(
    'increment_query_count',
    { p_user_id: userId }
  );
  if (quotaErr || quotaOk === false) {
    yield 'QUOTA_EXCEEDED: Upgrade your plan to continue generating content.';
    return;
  }

  // 2. Intent Classification
  const intentData = await classifyIntent(userPrompt);

  // 3. Document Retrieval
  let vaultContent = '';
  let isGrounded = false;
  let topChunkIds: string[] = [];

  if (priorityDocumentId) {
    const { data: activeDoc } = await supabase
      .from('documents')
      .select('id, name, authority, subject, grade_level, master_md_dialect')
      .eq('id', priorityDocumentId)
      .single();

    if (activeDoc) {
      const codes = extractSLOCodes(userPrompt);
      if (codes.length > 0) {
        const { data: sloMatch } = await supabase
          .from('document_chunks')
          .select('id, chunk_text')
          .contains('slo_codes', [normalizeSLO(codes[0].code)])
          .eq('document_id', activeDoc.id)
          .limit(3);

        if (sloMatch && sloMatch.length > 0) {
          vaultContent = `### SURGICAL_VAULT_EXTRACT\n${sloMatch.map(s=>s.chunk_text).join('\n---\n')}\n\n### BROADER_CONTEXT\n`;
          topChunkIds = sloMatch.map(s=>s.id);
          // Don't set isGrounded=true yet so we ALSO pull semantic chunks
        }
      }

      const augmentedQuery = `${userPrompt} ${activeDoc.subject || ''} ${activeDoc.name || ''}`.trim();
      let chunks = await retrieveRelevantChunks({
        query: augmentedQuery,
        documentIds: [activeDoc.id],
        supabase,
        matchCount: 8,
        dialect: activeDoc.master_md_dialect
      });
      
      // Fallback: If no semantic matches, just grab the first few chunks of the document
      if (chunks.length === 0) {
        const { data: genericChunks } = await supabase
            .from('document_chunks')
            .select('id, chunk_text')
            .eq('document_id', activeDoc.id)
            .order('chunk_index', { ascending: true })
            .limit(8);
            
        if (genericChunks && genericChunks.length > 0) {
            chunks = genericChunks.map(c => ({
                chunk_id: c.id,
                document_id: activeDoc.id,
                chunk_text: c.chunk_text,
                slo_codes: [],
                metadata: {},
                combined_score: 1.0
            }));
        }
      }
      
      // Filter out chunks that were already included via SLO match to avoid duplication
      const newChunks = chunks.filter(c => !topChunkIds.includes(c.chunk_id));
      vaultContent += newChunks.map(c => c.chunk_text).join('\n---\n');
      topChunkIds = [...topChunkIds, ...newChunks.map(c => c.chunk_id)];
      isGrounded = topChunkIds.length > 0;
    }
  }

  // 4. Neural Synthesis Stream
  const systemInstruction = customSystem || 'You are the Pedagogy Master AI.';
  let docContext = '';
  if (priorityDocumentId) {
    const { data: activeDoc } = await supabase.from('documents').select('name, subject, grade_level').eq('id', priorityDocumentId).single();
    if (activeDoc) docContext = `[DOCUMENT SELECTED: ${activeDoc.name} | SUBJECT: ${activeDoc.subject || 'General'} | GRADE: ${activeDoc.grade_level || 'General'}]`;
  }

  const finalPrompt = `
<CONTEXT>
INTENT: ${intentData.intent} | COMPLEXITY: ${intentData.complexity}
${adaptiveContext || ''}
${docContext}
</CONTEXT>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: Use General Pedagogical Knowledge]'}
</AUTHORITATIVE_VAULT>

USER_QUERY: "${userPrompt}"`;

  const stream = synthesizeStream(finalPrompt, {
    history: history.slice(-6),
    isGrounded,
    suggestedProvider: intentData.suggestedProvider,
    systemPrompt: systemInstruction,
    complexity: intentData.complexity
  });

  for await (const token of stream) {
    yield token;
  }
}

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

  // 2. Intent Classification
  const intentData = await classifyIntent(userPrompt);

  // 3. Cache Lookup (SHA-256)
  const cacheKey = `synth:${createHash('sha256').update(userPrompt).digest('hex')}`;
  const cached = await kv.get<string>(cacheKey);
  if (cached) return { text: cached, provider: 'Neural Cache', metadata: { cached: true } };

  // 4. Document Retrieval (Fixed)
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
          .limit(3);

        if (sloMatch && sloMatch.length > 0) {
          vaultContent = `### SURGICAL_VAULT_EXTRACT\n${sloMatch.map(s=>s.chunk_text).join('\n---\n')}\n\n### BROADER_CONTEXT\n`;
          topChunkIds = sloMatch.map(s=>s.id);
        }
      }

      const augmentedQuery = `${userPrompt} ${activeDoc.subject || ''} ${activeDoc.name || ''}`.trim();
      let chunks = await retrieveRelevantChunks({
        query: augmentedQuery,
        documentIds: [activeDoc.id],
        supabase,
        matchCount: 8,
        dialect: activeDoc.master_md_dialect
      });

      // Fallback: If no semantic matches, just grab the first few chunks of the document
      if (chunks.length === 0) {
        const { data: genericChunks } = await supabase
            .from('document_chunks')
            .select('id, chunk_text')
            .eq('document_id', activeDoc.id)
            .order('chunk_index', { ascending: true })
            .limit(8);
            
        if (genericChunks && genericChunks.length > 0) {
            chunks = genericChunks.map(c => ({
                chunk_id: c.id,
                document_id: activeDoc.id,
                chunk_text: c.chunk_text,
                slo_codes: [],
                metadata: {},
                combined_score: 1.0
            }));
        }
      }

      const newChunks = chunks.filter(c => !topChunkIds.includes(c.chunk_id));
      vaultContent += newChunks.map(c => c.chunk_text).join('\n---\n');
      topChunkIds = [...topChunkIds, ...newChunks.map(c => c.chunk_id)];
      isGrounded = topChunkIds.length > 0;
    }
  }

  // 5. Neural Synthesis
  const systemInstruction = customSystem || 'You are the Pedagogy Master AI.';
  let docContext = '';
  if (priorityDocumentId) {
    const { data: activeDoc } = await supabase.from('documents').select('name, subject, grade_level').eq('id', priorityDocumentId).single();
    if (activeDoc) docContext = `[DOCUMENT SELECTED: ${activeDoc.name} | SUBJECT: ${activeDoc.subject || 'General'} | GRADE: ${activeDoc.grade_level || 'General'}]`;
  }

  const finalPrompt = `
<CONTEXT>
INTENT: ${intentData.intent} | COMPLEXITY: ${intentData.complexity}
${adaptiveContext || ''}
${docContext}
</CONTEXT>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: Use General Pedagogical Knowledge]'}
</AUTHORITATIVE_VAULT>

USER_QUERY: "${userPrompt}"`;

  const result = await synthesize(finalPrompt, {
    history: history.slice(-6),
    isGrounded,
    suggestedProvider: intentData.suggestedProvider,
    systemPrompt: systemInstruction,
    complexity: intentData.complexity
  });

  const latency = Date.now() - start;

  // Logging
  supabase.from('retrieval_logs').insert({
    user_id: userId,
    query_text: userPrompt,
    top_chunk_ids: topChunkIds,
    confidence_score: isGrounded ? 0.95 : 0.4,
    latency_ms: latency,
    provider_used: result.provider
  }).then();

  // Selective Caching
  const isCacheable = intentData.complexity < 3 && intentData.intent === 'lookup' 
    && !userPrompt.includes('create') && !userPrompt.includes('generate');

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