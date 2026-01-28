import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, getProvidersConfig } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes, extractGradeFromSLO } from '../rag/slo-extractor';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * Provides status of all configured AI nodes.
 */
export async function getProviderStatus() {
  const configs = getProvidersConfig();
  return Promise.all(configs.map(async (config) => {
    const remaining = await rateLimiter.getRemainingRequests(config.name, config);
    return {
      name: config.name,
      enabled: config.enabled,
      remaining,
      limits: { rpm: config.rpm, rpd: config.rpd }
    };
  }));
}

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v50.0)
 * Optimized for Extreme Precision and Multi-Agent Resilience.
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
  
  // 1. Precise Extraction
  const extractedSLOs = extractSLOCodes(userPrompt);
  const targetSLO = extractedSLOs.length > 0 ? extractedSLOs[0] : null;
  const isolatedGrade = targetSLO ? extractGradeFromSLO(targetSLO) : null;

  const isGlobalEnabled = userPrompt.includes('GLOBAL_RESOURCES_MODE: ACTIVE');
  const isCurriculumEnabled = userPrompt.includes('CURRICULUM_MODE: ACTIVE');

  // 2. Multi-Layer Scoping
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed, authority, subject, grade_level, version_year, extracted_text')
    .eq('user_id', userId)
    .eq('is_selected', true); 
  
  const activeDocs = selectedDocs || [];
  let documentIds = isCurriculumEnabled ? (activeDocs.map(d => d.id) || []) : [];
  
  if (priorityDocumentId && isCurriculumEnabled && !documentIds.includes(priorityDocumentId)) {
    documentIds = [priorityDocumentId, ...documentIds];
  }

  // 3. High-Fidelity Retrieval
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    try {
      retrievedChunks = await retrieveRelevantChunks({
        query: userPrompt,
        documentIds: documentIds,
        supabase,
        matchCount: 60 
      });
    } catch (err) {
      console.warn("⚠️ [Orchestrator] Retriever Failure.");
    }
  }
  
  // 4. Authoritative Vault Construction
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => {
        const sourceName = activeDocs.find(d => d.id === chunk.document_id)?.name || 'Vault';
        const exactMarker = chunk.is_exact_match ? " [!!! VERIFIED_SLO_MATCH !!!]" : "";
        const gradeMarker = chunk.grade_levels?.length ? ` [Context: Grade ${chunk.grade_levels.join(',')}]` : "";
        
        return `### NODE_${i + 1} (${sourceName})${exactMarker}${gradeMarker}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  } else if (activeDocs.length > 0 && isCurriculumEnabled) {
    vaultContent = `[RAW_SOURCE_FALLBACK] (SOURCE: ${activeDocs[0].name})\n${activeDocs[0].extracted_text?.substring(0, 12000)}`;
  }

  // 5. Instruction Synthesis
  let globalInstruction = "";
  if (isGlobalEnabled) {
    globalInstruction = `\n### 🌐 GLOBAL PERSPECTIVE (AUGMENTATION)\nEnhance the content with international pedagogical standards while mapping exactly to the local SLO requirements.\n`;
  }

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const primaryDoc = activeDocs.find(d => d.id === (priorityDocumentId || (documentIds.length > 0 ? documentIds[0] : null))) || activeDocs[0];
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, primaryDoc);

  // 6. TARGET ENFORCEMENT (V7.0: Zero-Tolerance for Hallucination)
  let targetEnforcement = "";
  if (targetSLO && isCurriculumEnabled) {
    targetEnforcement = `
🔴 STICKY_CONTEXT_LOCK: User requested synthesis for objective [${targetSLO}].
- SEARCH the vault for [${targetSLO}] or "Grade ${isolatedGrade || '8'}".
- If the vault discusses [Water Pollution] but the query is about [Electromagnets], DISCARD the Water Pollution text.
- DEFINITION: Use the exact text associated with ${targetSLO} from the vault nodes above.
- IF NO MATCH FOUND: State: "Objective ${targetSLO} not found in current curriculum context." Do NOT generate generic content.
`;
  }

  let finalPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent}
</AUTHORITATIVE_VAULT>

${isCurriculumEnabled ? NUCLEAR_GROUNDING_DIRECTIVE : '⚠️ CREATIVE_MODE: Generic Knowledge Active.'}
${targetEnforcement}
${globalInstruction}

## TEACHER COMMAND:
"${userPrompt}"

## OUTPUT PARAMETERS:
${responseInstructions}`;

  // Force high-fidelity provider for all curriculum-linked requests
  const preferredProvider = (isCurriculumEnabled || targetSLO) ? 'gemini' : undefined;
  
  const result = await synthesize(
    finalPrompt, 
    history.slice(-4), 
    retrievedChunks.length > 0 || vaultContent.includes('FALLBACK'), 
    [], 
    preferredProvider,
    customSystem || DEFAULT_MASTER_PROMPT
  );
  
  const sources = [
    ...(result.groundingMetadata?.groundingChunks?.map((c: any) => c.web).filter(Boolean) || []),
    ...(result.groundingMetadata?.groundingChunks?.map((c: any) => c.maps).filter(Boolean) || [])
  ];

  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      chunksUsed: retrievedChunks.length,
      isGrounded: isCurriculumEnabled && (retrievedChunks.length > 0 || vaultContent.includes('FALLBACK')),
      sourceDocument: primaryDoc?.name || 'Curriculum Grid',
      extractedSLOs,
      sources: sources.length > 0 ? sources : undefined,
      gradeIsolation: isolatedGrade
    }
  };
}