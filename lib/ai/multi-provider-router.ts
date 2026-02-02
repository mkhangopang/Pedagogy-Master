import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v92.0)
 * Feature: Dialect-Aware Pedagogical Synthesis.
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
  
  const extractedSLOs = extractSLOCodes(userPrompt);
  const primarySLO = extractedSLOs.length > 0 ? extractedSLOs[0] : null;

  // 1. Context Resolution
  let docQuery = supabase
    .from('documents')
    .select('id, name, authority, subject, grade_level, version_year, extracted_text')
    .eq('user_id', userId);

  if (priorityDocumentId) {
    docQuery = docQuery.eq('id', priorityDocumentId);
  } else {
    docQuery = docQuery.eq('is_selected', true);
  }

  const { data: activeDocs } = await docQuery;
  const activeDoc = activeDocs?.[0];
  const documentIds = activeDocs?.map(d => d.id) || [];
  
  // Detect Dialect from Master MD tag
  const dialectTag = activeDoc?.extracted_text?.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

  const dialectMemo = `
### PEDAGOGICAL_DIALECT_ACTIVE: ${dialectTag}
- AUTHORITY: ${activeDoc?.authority || 'Independent'}
- PHILOSOPHY: ${dialectTag.includes('Cambridge') ? 'Inquiry & AO-based' : 'SLO & Benchmark-based'}
- TERMINOLOGY: Always use "${dialectTag.includes('Cambridge') ? 'Learning Outcomes' : 'Student Learning Objectives (SLOs)'}"
`;

  let vaultContent = "";
  let verbatimFound = false;
  let mode: 'VAULT' | 'GLOBAL' = documentIds.length > 0 ? 'VAULT' : 'GLOBAL';
  let retrievedChunks: RetrievedChunk[] = [];

  // 2. Multi-Stage Retrieval
  if (mode === 'VAULT') {
    retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds,
      supabase,
      matchCount: 40
    });
  }

  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => {
        const isVerbatim = chunk.is_verbatim_definition || (primarySLO && chunk.slo_codes?.includes(primarySLO));
        if (isVerbatim) verbatimFound = true;
        return `### VAULT_NODE_${i + 1}${isVerbatim ? " [VERBATIM_STANDARD]" : ""}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  }

  // 3. Synthesis Pipeline
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDoc);
  
  const systemInstruction = customSystem || DEFAULT_MASTER_PROMPT;

  const finalPrompt = `
<PEDAGOGY_DNA>
${dialectMemo}
${adaptiveContext || ''}
</PEDAGOGY_DNA>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: Context link failure]'}
</AUTHORITATIVE_VAULT>

## MISSION:
Synthesize a world-class instructional artifact.

## GROUNDING_PROTOCOL:
1. VERBATIM ENFORCEMENT: If a node is marked [VERBATIM_STANDARD], use its EXACT description.
2. DIALECT ALIGNMENT: Speak in the active dialect (${dialectTag}).
3. ZERO HALLUCINATION: If the vault lacks specific content for "${userPrompt}", state it clearly but offer to use Global Creative Node as a fallback.

## COMMAND:
"${userPrompt}"

## EXECUTION_SPEC:
${responseInstructions}`;

  const result = await synthesize(
    finalPrompt, 
    history.slice(-6), 
    mode === 'VAULT', 
    [], 
    'gemini', 
    systemInstruction
  );
  
  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      chunksUsed: retrievedChunks?.length || 0,
      verbatimVerified: verbatimFound,
      dialect: dialectTag,
      sourceDocument: activeDoc?.name || 'Autonomous Node',
      isGrounded: verbatimFound
    }
  } as any;
}