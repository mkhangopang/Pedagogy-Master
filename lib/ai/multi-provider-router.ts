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
  let sourceDocName = '';
  let effectiveDocumentIds: string[] = [];

  if (priorityDocumentId) {
    effectiveDocumentIds = [priorityDocumentId];
  } else {
    // If no priority doc, search across all "ready" documents the user has access to (plus public ones)
    const { data: availableDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('status', 'ready')
      .or(`user_id.eq.${userId},is_public.eq.true`)
      .limit(20);
    
    if (availableDocs && availableDocs.length > 0) {
      effectiveDocumentIds = availableDocs.map(d => d.id);
    }
  }

  if (effectiveDocumentIds.length > 0) {
    // If it's a single priority doc, we get its name for context
    if (priorityDocumentId) {
      const { data: activeDoc } = await supabase
        .from('documents')
        .select('name, authority, subject, grade_level, master_md_dialect')
        .eq('id', priorityDocumentId)
        .single();
      
      if (activeDoc) {
        sourceDocName = activeDoc.name;
        
        // SLO Surgical Extraction (Priority Doc Only)
        const codes = extractSLOCodes(userPrompt);
        if (codes.length > 0) {
          const { data: sloMatch } = await supabase
            .from('document_chunks')
            .select('id, chunk_text')
            .contains('slo_codes', [normalizeSLO(codes[0].code)])
            .eq('document_id', priorityDocumentId)
            .limit(3);
          
          if (sloMatch && sloMatch.length > 0) {
            vaultContent = `### SURGICAL_VAULT_EXTRACT\n${sloMatch.map(s=>s.chunk_text).join('\n---\n')}\n\n### BROADER_CONTEXT\n`;
            topChunkIds = sloMatch.map(s=>s.id);
          }
        }
      }
    }

    const { data: firstDoc } = priorityDocumentId 
      ? { data: null } 
      : await supabase.from('documents').select('master_md_dialect').in('id', effectiveDocumentIds).limit(1).maybeSingle();

    const augmentedQuery = sourceDocName ? `${userPrompt} ${sourceDocName}` : userPrompt;
    let chunks = await retrieveRelevantChunks({
      query: augmentedQuery,
      documentIds: effectiveDocumentIds,
      supabase,
      matchCount: 15,
      dialect: priorityDocumentId ? (await supabase.from('documents').select('master_md_dialect').eq('id', priorityDocumentId).single()).data?.master_md_dialect : undefined
    });
    
    // Fallback: If no semantic matches and single doc, just grab the first few chunks
    if (chunks.length === 0 && priorityDocumentId) {
      const { data: genericChunks } = await supabase
          .from('document_chunks')
          .select('id, chunk_text')
          .eq('document_id', priorityDocumentId)
          .order('chunk_index', { ascending: true })
          .limit(10);
          
      if (genericChunks && genericChunks.length > 0) {
          chunks = genericChunks.map(c => ({
              chunk_id: c.id,
              document_id: priorityDocumentId,
              chunk_text: c.chunk_text,
              slo_codes: [],
              metadata: {},
              combined_score: 1.0
          }));
      }
    }
    
    const newChunks = chunks.filter(c => !topChunkIds.includes(c.chunk_id));
    if (newChunks.length > 0 || topChunkIds.length > 0) {
      let formattedVault = vaultContent || '### AUTHORITATIVE_CURRICULUM_VAULT\n';
      
      newChunks.forEach((c) => {
        formattedVault += `\n[CHUNK_ID: ${c.chunk_id}]\n${c.chunk_text}\n---\n`;
      });

      vaultContent = formattedVault;
      topChunkIds = [...topChunkIds, ...newChunks.map(c => c.chunk_id)];
      isGrounded = topChunkIds.length > 0;
    }
  }

  // 4. Neural Synthesis Stream
  let systemInstruction = customSystem || 'You are the Pedagogy Master AI.';
  let docContext = '';
  if (priorityDocumentId) {
    docContext = `[DOCUMENT SELECTED: ${sourceDocName || 'Specific Curriculum'}]`;
    // RELAXED GROUNDING: Highly encourage vault use, but allow fallback with clear labeling
    systemInstruction = `GROUNDED_RESPONSE_ENFORCED.
You are generating content FOR THE SELECTED CURRICULUM: ${sourceDocName || 'Specific Curriculum'}.
GROUNDING RULES:
1. PRIMARY_SOURCE: Use the <AUTHORITATIVE_VAULT> below for all specific standards and SLOs.
2. CITATION: CITE [CHUNK_ID] when using specific data from the vault.
3. HANDLING_MISSING_DATA: If the <AUTHORITATIVE_VAULT> does not contain the specific topic requested:
   a. First, state clearly that the specific curriculum standard was not found in the selected document.
   b. Then, provide a response based on "General Pedagogical Best Practices" to be helpful.
   c. If you provide general information, you MUST prefix those sections with [GENERAL_PEDAGOGY].
4. NEVER pretend generic information is from the specific curriculum.

${systemInstruction}`;
  } else {
    systemInstruction = `You are the Pedagogy Master AI. 
Provide pedagogical support using the available curriculum context. 
If information is missing from the vault, you may use your general pedagogical knowledge but CLEARLY state that it is not grounded in a specific institutional curriculum.

${systemInstruction}`;
  }

  const finalPrompt = `
<GROUNDING_STATUS>
IS_GROUNDED: ${isGrounded ? 'YES' : 'NO'}
VAULT_SOURCE: ${priorityDocumentId || 'NONE'}
${docContext}
</GROUNDING_STATUS>

<CONTEXT>
INTENT: ${intentData.intent} | COMPLEXITY: ${intentData.complexity}
${adaptiveContext || ''}
</CONTEXT>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: NO CLASSIFIED CONTENT EXTRACTED. REFUSE REQUEST PER RULE 2.]'}
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
  let effectiveDocumentIds: string[] = [];

  if (priorityDocumentId) {
    effectiveDocumentIds = [priorityDocumentId];
  } else {
    // Search across user's documents + public documents
    const { data: availableDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('status', 'ready')
      .or(`user_id.eq.${userId},is_public.eq.true`)
      .limit(15);
    
    if (availableDocs && availableDocs.length > 0) {
      effectiveDocumentIds = availableDocs.map(d => d.id);
    }
  }

  if (effectiveDocumentIds.length > 0) {
    if (priorityDocumentId) {
      const { data: activeDoc } = await supabase
        .from('documents')
        .select('name, authority, subject, grade_level, master_md_dialect')
        .eq('id', priorityDocumentId)
        .single();
      
      if (activeDoc) {
        sourceDocName = activeDoc.name;
        // SLO Surgical Extraction (Priority Doc Only)
        const codes = extractSLOCodes(userPrompt);
        if (codes.length > 0) {
          const { data: sloMatch } = await supabase
            .from('document_chunks')
            .select('id, chunk_text')
            .contains('slo_codes', [normalizeSLO(codes[0].code)])
            .eq('document_id', priorityDocumentId)
            .limit(3);
          
          if (sloMatch && sloMatch.length > 0) {
            vaultContent = `### SURGICAL_VAULT_EXTRACT\n${sloMatch.map(s=>s.chunk_text).join('\n---\n')}\n\n### BROADER_CONTEXT\n`;
            topChunkIds = sloMatch.map(s=>s.id);
          }
        }
      }
    }

    const { data: firstDoc } = priorityDocumentId 
      ? { data: null } 
      : await supabase.from('documents').select('master_md_dialect').in('id', effectiveDocumentIds).limit(1).maybeSingle();

    const augmentedQuery = sourceDocName ? `${userPrompt} ${sourceDocName}` : userPrompt;
    let chunks = await retrieveRelevantChunks({
      query: augmentedQuery,
      documentIds: effectiveDocumentIds,
      supabase,
      matchCount: 15,
      dialect: priorityDocumentId ? (await supabase.from('documents').select('master_md_dialect').eq('id', priorityDocumentId).single()).data?.master_md_dialect : undefined
    });
    
    // Fallback: If no semantic matches and single doc
    if (chunks.length === 0 && priorityDocumentId) {
      const { data: genericChunks } = await supabase
          .from('document_chunks')
          .select('id, chunk_text')
          .eq('document_id', priorityDocumentId)
          .order('chunk_index', { ascending: true })
          .limit(10);
          
      if (genericChunks && genericChunks.length > 0) {
          chunks = genericChunks.map(c => ({
              chunk_id: c.id,
              document_id: priorityDocumentId,
              chunk_text: c.chunk_text,
              slo_codes: [],
              metadata: {},
              combined_score: 1.0
          }));
      }
    }
    
    const newChunks = chunks.filter(c => !topChunkIds.includes(c.chunk_id));
    if (newChunks.length > 0 || topChunkIds.length > 0) {
      let formattedVault = vaultContent || '### AUTHORITATIVE_CURRICULUM_VAULT\n';
      newChunks.forEach((c) => {
        formattedVault += `\n[CHUNK_ID: ${c.chunk_id}]\n${c.chunk_text}\n---\n`;
      });
      vaultContent = formattedVault;
      topChunkIds = [...topChunkIds, ...newChunks.map(c => c.chunk_id)];
      isGrounded = topChunkIds.length > 0;
    }
  }

  // 5. Neural Synthesis
  let systemInstruction = customSystem || 'You are the Pedagogy Master AI.';
  let docContext = '';
  if (priorityDocumentId) {
    docContext = `[DOCUMENT SELECTED: ${sourceDocName || 'Specific Curriculum'}]`;
    // RELAXED GROUNDING: Highly encourage vault use, but allow fallback with clear labeling
    systemInstruction = `GROUNDED_RESPONSE_ENFORCED.
You are generating content FOR THE SELECTED CURRICULUM: ${sourceDocName || 'Specific Curriculum'}.
GROUNDING RULES:
1. PRIMARY_SOURCE: Use the <AUTHORITATIVE_VAULT> below for all specific standards and SLOs.
2. CITATION: CITE [CHUNK_ID] when using specific data from the vault.
3. HANDLING_MISSING_DATA: If the <AUTHORITATIVE_VAULT> does not contain the specific topic requested:
   a. First, state clearly that the specific curriculum standard was not found in the selected document.
   b. Then, provide a response based on "General Pedagogical Best Practices" to be helpful.
   c. If you provide general information, you MUST prefix those sections with [GENERAL_PEDAGOGY].
4. NEVER pretend generic information is from the specific curriculum.

${systemInstruction}`;
  } else {
    systemInstruction = `You are the Pedagogy Master AI. 
Provide pedagogical support using the available curriculum context. 
If information is missing from the vault, you may use your general pedagogical knowledge but CLEARLY state that it is not grounded in a specific institutional curriculum.

${systemInstruction}`;
  }

  const finalPrompt = `
<GROUNDING_STATUS>
IS_GROUNDED: ${isGrounded ? 'YES' : 'NO'}
VAULT_SOURCE: ${priorityDocumentId || 'NONE'}
${docContext}
</GROUNDING_STATUS>

<CONTEXT>
INTENT: ${intentData.intent} | COMPLEXITY: ${intentData.complexity}
${adaptiveContext || ''}
</CONTEXT>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: NO CLASSIFIED CONTENT EXTRACTED. REFUSE REQUEST PER RULE 2.]'}
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