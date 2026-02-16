import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks } from '../rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../rag/slo-extractor';
import { parseSLOCode } from '../rag/slo-parser';
import { classifyIntent } from './intent-classifier';
import { kv } from '../kv';
import { Buffer } from 'buffer';

/**
 * MULTI-STAGE RETRIEVAL CASCADE (v127.0 - UNIVERSAL LOGIC)
 * T1: Redis Cache | T2: Intent Routing | T3: Parsed Atomic Match | T4: Hybrid Semantic
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
  
  // 1. INTENT CLASSIFICATION
  const intentData = await classifyIntent(userPrompt);

  // 2. CACHE LOOKUP
  const cacheKey = `synth:${Buffer.from(userPrompt).toString('base64').substring(0, 40)}`;
  const cached = await kv.get<string>(cacheKey);
  if (cached) return { text: cached, provider: 'Neural Cache', metadata: { cached: true } };

  // 3. RETRIEVAL CASCADE (UNIVERSAL DOCUMENT LOGIC)
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
    
    // Stage A: High-Fidelity Parsed Code Match
    const parsedCodes = extractSLOCodes(userPrompt);
    if (parsedCodes.length > 0) {
      const parsedSlo = parseSLOCode(parsedCodes[0].code);
      const searchKey = parsedSlo?.searchable || normalizeSLO(parsedCodes[0].code);
      
      const { data: sloMatch } = await supabase.from('document_chunks')
        .select('id, chunk_text')
        .contains('slo_codes', [searchKey])
        .eq('document_id', activeDoc.id)
        .limit(1);
      
      if (sloMatch?.[0]) {
        vaultContent = `### UNIVERSAL_NODE: ${searchKey}\n${sloMatch[0].chunk_text}`;
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
        matchCount: 10,
        dialect: activeDoc.master_md_dialect
      });
      vaultContent = chunks.map(c => c.chunk_text).join('\n---\n');
      topChunkIds = chunks.map(c => c.chunk_id);
      isGrounded = chunks.length > 0;
    }
  }

  // 4. NEURAL SYNTHESIS
  const systemInstruction = customSystem || "You are the Pedagogy Master AI.";
  const finalPrompt = `
<CONTEXT>
INTENT: ${intentData.intent} | COMPLEXITY: ${intentData.complexity}
GROUNDING: ${isGrounded ? 'ACTIVE' : 'INACTIVE'}
${adaptiveContext || ''}
</CONTEXT>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: Use General Pedagogical Knowledge]'}
</AUTHORITATIVE_VAULT>

USER_QUERY: "${userPrompt}"`;

  const result = await synthesize(
    finalPrompt, 
    history.slice(-4), 
    isGrounded, 
    [], 
    intentData.suggestedProvider, 
    systemInstruction,
    intentData.complexity
  );

  const latency = Date.now() - start;
  
  if (intentData.complexity < 3 && !userPrompt.includes('create')) {
    await kv.set(cacheKey, result.text, 3600);
  }

  return {
    text: result.text,
    provider: result.provider,
    metadata: { isGrounded, sourceDocument: sourceDocName, intent: intentData.intent, latency, chunkCount: topChunkIds.length }
  };
}
