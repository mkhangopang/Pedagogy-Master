import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * WORLD-CLASS NEURAL SYNTHESIS ORCHESTRATOR (v116.0)
 * Signature: Multi-Dialect Context Locking & Master MD Scan.
 * FEATURE: Direct Master MD Literal Scanning for High-Fidelity Retrieval.
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
  
  // Extract Dialect metadata
  const dialectTag = activeDoc?.extracted_text?.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

  const pedagogyDNA = `
### PEDAGOGICAL_IDENTITY: ${dialectTag}
- AUTHORITY: ${activeDoc?.authority || 'Independent'}
- DIALECT: ${dialectTag.includes('Pakistani') ? 'Sindh/Federal (SLO-Based)' : 'International (Criteria-Based)'}
`;

  let vaultContent = "";
  let hardLockFound = false;
  let retrievedChunks: RetrievedChunk[] = [];

  // 3. ENHANCED MASTER MD SCAN (Literal Logic Priority)
  // If we have a Master MD and a specific SLO, we perform a sliding window scan for the exact text block.
  if (activeDoc?.extracted_text && primarySLO) {
    const md = activeDoc.extracted_text;
    const sloIndices: number[] = [];
    let pos = md.indexOf(primarySLO);
    while (pos !== -1) {
      sloIndices.push(pos);
      pos = md.indexOf(primarySLO, pos + 1);
    }

    if (sloIndices.length > 0) {
      console.log(`🎯 [Master MD Scan] Hard Match Found for ${primarySLO} in ${activeDoc.name}`);
      hardLockFound = true;
      // Extract large contexts around matches
      const snippets = sloIndices.map(idx => {
        const start = Math.max(0, idx - 1000);
        const end = Math.min(md.length, idx + 4000);
        return md.substring(start, end);
      });
      vaultContent += `\n### MASTER_MD_DIRECT_NODE [!!! VERBATIM_CURRICULUM_STANDARD !!!]\n${snippets.join('\n---\n')}\n`;
    }
  }

  // 4. Dual-Stage Vault Retrieval (Augmentation)
  if (documentIds.length > 0) {
    retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds,
      supabase,
      matchCount: 10
    });
  }

  if (retrievedChunks.length > 0) {
    vaultContent += retrievedChunks
      .map((chunk, i) => {
        const isVerbatim = primarySLO && (
          chunk.slo_codes?.includes(primarySLO) || 
          chunk.chunk_text.includes(primarySLO)
        );
        if (isVerbatim) hardLockFound = true;
        
        return `### VECTOR_NODE_${i + 1}${isVerbatim ? " [!!! VERBATIM_CURRICULUM_STANDARD !!!]" : ""}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  }

  // 5. Synthesis Architecture
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
1. HARD-LOCK: If any node is marked [!!! VERBATIM_CURRICULUM_STANDARD !!!], you MUST use its text word-for-word.
2. MASTER_MD_FETCH: Prioritize content from direct Master MD scans.
3. ZERO HALLUCINATION: Quote codes verbatim.

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
  };
}