import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * WORLD-CLASS NEURAL SYNTHESIS ORCHESTRATOR (v110.0)
 * Signature: Multi-Dialect Pedagogical Intelligence.
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

  // 1. Resolve Pedagogical Identity from active document
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
  
  // Extract Dialect metadata from the Master MD tag
  const dialectTag = activeDoc?.extracted_text?.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

  const pedagogyDNA = `
### ACTIVE_PEDAGOGY_PROTOCOL: ${dialectTag}
- AUTHORITY: ${activeDoc?.authority || 'Independent'}
- DIALECT: ${dialectTag.includes('Pakistani') ? 'Sindh/Federal (SLO-Based)' : 'Cambridge/IB (Criteria-Based)'}
- TERMINOLOGY: Always use "${dialectTag.includes('Pakistani') ? 'SLOs and Benchmarks' : 'Learning Outcomes and Strands'}".
- CORE_STRENGTH: 5E Instructional Cycle with Bloom's Alignment.
`;

  let vaultContent = "";
  let hardLockFound = false;
  let retrievedChunks: RetrievedChunk[] = [];

  // 2. High-Precision Context Retrieval
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
        
        return `### VAULT_NODE_${i + 1}${isVerbatim ? " [!!! VERBATIM_CURRICULUM_STANDARD !!!]" : ""}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  }

  // 3. Synthesis Preparation
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDoc);
  const systemInstruction = customSystem || DEFAULT_MASTER_PROMPT;

  const finalPrompt = `
<PEDAGOGICAL_DNA>
${pedagogyDNA}
${adaptiveContext || ''}
</PEDAGOGICAL_DNA>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: No curriculum node selected. Fallback to global node.]'}
</AUTHORITATIVE_VAULT>

## MISSION:
Synthesize an instructional artifact with 100% fidelity to the curriculum standards in the vault.

## GROUNDING_PROTOCOL:
1. VERBATIM FORCE: If a node is marked [!!! VERBATIM_CURRICULUM_STANDARD !!!], you MUST use its text word-for-word. DO NOT paraphrase the standard.
2. DIALECT ALIGNMENT: Stick to the instructional vocabulary of "${dialectTag}".
3. TRUNCATION GUARD: If the vault text for "${primarySLO || 'the objective'}" is incomplete, state: "Warning: SLO description truncated in source document."

## USER COMMAND:
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
      sourceDocument: activeDoc?.name || 'Global Creativity Node',
      chunksUsed: retrievedChunks.length
    }
  } as any;
}