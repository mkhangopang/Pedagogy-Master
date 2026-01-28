import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, getProvidersConfig } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes, extractGradeFromSLO } from '../rag/slo-extractor';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v51.0)
 * Optimized for Verbatim Curriculum Compliance.
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
  
  // 1. High-Fidelity Extraction
  const extractedSLOs = extractSLOCodes(userPrompt);
  const targetSLO = extractedSLOs.length > 0 ? extractedSLOs[0] : null;
  const isolatedGrade = targetSLO ? extractGradeFromSLO(targetSLO) : null;

  const isCurriculumEnabled = userPrompt.includes('CURRICULUM_MODE: ACTIVE');

  // 2. Scoping
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed, extracted_text')
    .eq('user_id', userId)
    .eq('is_selected', true); 
  
  const activeDocs = selectedDocs || [];
  let documentIds = isCurriculumEnabled ? (activeDocs.map(d => d.id) || []) : [];
  
  // 3. Retrieval (Fidelity Pass)
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds: documentIds,
      supabase,
      matchCount: 50 
    });
  }
  
  // 4. Verbatim Vault Construction
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => {
        const sourceName = activeDocs.find(d => d.id === chunk.document_id)?.name || 'Sindh Curriculum';
        const fidelityTag = chunk.is_exact_match ? " [!!! VERIFIED_VERBATIM_DEFINITION !!!]" : "";
        const gradeTag = chunk.grade_levels?.length ? ` [Grade: ${chunk.grade_levels.join(',')}]` : "";
        
        return `NODE_${i + 1} (${sourceName})${fidelityTag}${gradeTag}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  }

  // 5. STICKY CONTEXT LOCK (Zero-Hallucination Guard)
  let contextLock = "";
  if (targetSLO && isCurriculumEnabled) {
    contextLock = `
🔴 CRITICAL_VERITY_ENFORCEMENT: 
The teacher is requesting content for SLO [${targetSLO}].
1. SEARCH THE VAULT: Locate the node marked [VERIFIED_VERBATIM_DEFINITION].
2. VERIFY CONTENT: If the user asked for S-08-C-03, and the vault says it is about "Star Lifecycles", you MUST use that.
3. PREVENT MIMICRY: If you find Grade 4 content about "Water Pollution" but the code is S-08, DISCARD the water pollution data.
4. ABSENCE POLICY: If the exact definition of ${targetSLO} is not in the vault, say: "Objective ${targetSLO} definition missing from library." Do NOT make it up based on general knowledge.
`;
  }

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const primaryDoc = activeDocs[0];
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, primaryDoc);

  let finalPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: SEARCH_FAILURE]'}
</AUTHORITATIVE_VAULT>

${isCurriculumEnabled ? NUCLEAR_GROUNDING_DIRECTIVE : '⚠️ CREATIVE_MODE: Generic Mode.'}
${contextLock}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
${responseInstructions}`;

  const result = await synthesize(
    finalPrompt, 
    history.slice(-4), 
    retrievedChunks.length > 0, 
    [], 
    'gemini', // Hard-lock Gemini for precision
    customSystem || DEFAULT_MASTER_PROMPT
  );
  
  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      chunksUsed: retrievedChunks.length,
      isGrounded: isCurriculumEnabled && retrievedChunks.length > 0,
      sourceDocument: primaryDoc?.name || 'Curriculum Hub',
      extractedSLOs,
      gradeIsolation: isolatedGrade
    }
  };
}

/**
 * NEURAL GRID STATUS AGGREGATOR
 * Fix: Implemented missing getProviderStatus export for AI status monitoring
 */
export async function getProviderStatus() {
  const configs = getProvidersConfig();
  const status = await Promise.all(configs.map(async (config) => {
    const remaining = await rateLimiter.getRemainingRequests(config.name, config);
    return {
      name: config.name,
      enabled: config.enabled,
      limits: { rpm: config.rpm, rpd: config.rpd },
      remaining
    };
  }));
  return status;
}