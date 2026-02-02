import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * WORLD-CLASS NEURAL SYNTHESIS ORCHESTRATOR (v115.0)
 * Signature: Multi-Dialect Context Locking & Hallucination Suppression.
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
  
  // 1. Identify Target Standards (SLOs)
  const extractedSLOs = extractSLOCodes(userPrompt);
  const primarySLO = extractedSLOs.length > 0 ? extractedSLOs[0] : null;

  // 2. Resolve Active Institutional Identity
  let docQuery = supabase
    .from('documents')
    .select('id, name, authority, subject, grade_level, extracted_text')
    .eq('user_id', userId);

  if (priorityDocumentId) {
    docQuery = docQuery.eq('id', priorityDocumentId);
  } else {
    docQuery = docQuery.eq('is_selected', true);
  }

  const { data: activeDocs } = await docQuery;
  const activeDoc = activeDocs?.[0];
  const documentIds = activeDocs?.map(d => d.id) || [];
  
  // Extract Dialect metadata for Native Pedagogical Alignment
  const dialectTag = activeDoc?.extracted_text?.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

  const pedagogyDNA = `
### PEDAGOGICAL_IDENTITY: ${dialectTag}
- AUTHORITY: ${activeDoc?.authority || 'Independent'}
- DIALECT: ${dialectTag.includes('Pakistani') ? 'Sindh/Federal (SLO-Based)' : 'International (Criteria-Based)'}
- TERMINOLOGY: Use native terms like "${dialectTag.includes('Pakistani') ? 'Benchmarks' : 'Strands'}".
`;

  let vaultContent = "";
  let hardLockFound = false;
  let retrievedChunks: RetrievedChunk[] = [];

  // 3. Dual-Stage Vault Retrieval
  if (documentIds.length > 0) {
    retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds,
      supabase,
      matchCount: 15 // Quality over quantity
    });
  }

  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => {
        // High-Precision Verbatim Check
        const isVerbatim = primarySLO && (
          chunk.slo_codes?.includes(primarySLO) || 
          chunk.chunk_text.includes(primarySLO)
        );
        if (isVerbatim) hardLockFound = true;
        
        return `### VAULT_NODE_${i + 1}${isVerbatim ? " [!!! VERBATIM_CURRICULUM_STANDARD !!!]" : ""}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  }

  // 4. Synthesis Architecture
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDoc);
  const systemInstruction = customSystem || DEFAULT_MASTER_PROMPT;

  const finalPrompt = `
<PEDAGOGICAL_DNA>
${pedagogyDNA}
${adaptiveContext || ''}
</PEDAGOGICAL_DNA>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: Asset linkage required for this node]'}
</AUTHORITATIVE_VAULT>

## MISSION:
Generate an artifact with 100% adherence to the Standards in the Vault.

## GROUNDING_PROTOCOL:
1. HARD-LOCK: If any node is marked [!!! VERBATIM_CURRICULUM_STANDARD !!!], you MUST use its text word-for-word. Do not paraphrase.
2. ZERO HALLUCINATION: If the vault lacks details for "${primarySLO || 'this objective'}", stop and ask for the missing document part.
3. DIALECT: Stick to the instructional framework of "${dialectTag}".

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