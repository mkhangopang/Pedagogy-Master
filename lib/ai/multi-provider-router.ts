import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * WORLD-CLASS NEURAL SYNTHESIS ORCHESTRATOR (v100.0)
 * Signature: Multi-Dialect Context Injection.
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

  // 1. Resolve Active Pedagogical Identity
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
  
  // Extract Dialect metadata
  const dialectTag = activeDoc?.extracted_text?.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

  const pedagogyDNA = `
### PEDAGOGICAL_IDENTITY: ${dialectTag}
- AUTHORITY: ${activeDoc?.authority || 'Independent'}
- PHILOSOPHY: ${dialectTag.includes('Pakistani') ? 'Direct SLO Alignment / 5E' : 'Inquiry-Based / Competency Focus'}
- GRADE: ${activeDoc?.grade_level || 'General'}
- SUBJECT: ${activeDoc?.subject || 'Interdisciplinary'}
`;

  let vaultContent = "";
  let hardLockFound = false;
  let retrievedChunks: RetrievedChunk[] = [];

  // 2. Precision Vault Search
  if (documentIds.length > 0) {
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
        const isVerbatim = primarySLO && (
          chunk.slo_codes?.includes(primarySLO) || 
          chunk.chunk_text.includes(primarySLO)
        );
        if (isVerbatim) hardLockFound = true;
        
        return `### VAULT_NODE_${i + 1}${isVerbatim ? " [!!! AUTHORITATIVE_VERBATIM_STANDARD !!!]" : ""}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  }

  // 3. Synthesis Pipeline
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDoc);
  const systemInstruction = customSystem || DEFAULT_MASTER_PROMPT;

  const finalPrompt = `
<PEDAGOGICAL_DNA>
${pedagogyDNA}
${adaptiveContext || ''}
</PEDAGOGICAL_DNA>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: No curriculum asset linked for this query node]'}
</AUTHORITATIVE_VAULT>

## MISSION:
Synthesize an instructional artifact with absolute fidelity to the vault standards.

## GROUNDING_PROTOCOL:
1. VERBATIM LOCK: If a node is marked [!!! AUTHORITATIVE_VERBATIM_STANDARD !!!], you MUST use its text EXACTLY. Do not summarize the core objective.
2. DIALECT: Respect the terms of "${dialectTag}".
3. FALLBACK: If the vault is empty but user query contains an SLO code, inform them the asset is missing and offer Global Knowledge Node fallback.

## COMMAND:
"${userPrompt}"

## EXECUTION_SPEC:
${responseInstructions}`;

  const result = await synthesize(finalPrompt, history.slice(-6), hardLockFound, [], 'gemini', systemInstruction);
  
  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      isGrounded: hardLockFound,
      dialect: dialectTag,
      sourceDocument: activeDoc?.name || 'Global Node',
      chunksUsed: retrievedChunks.length
    }
  } as any;
}