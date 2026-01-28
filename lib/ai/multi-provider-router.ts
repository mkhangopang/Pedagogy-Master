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
 * NEURAL SYNTHESIS ORCHESTRATOR (v48.0)
 * Optimized for Multi-Segmented SLO IDs and Atomic Retrieval.
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
  
  // 1. Metadata Extraction
  const extractedSLOs = extractSLOCodes(userPrompt);
  const targetSLO = extractedSLOs.length > 0 ? extractedSLOs[0] : null;
  const isolatedGrade = targetSLO ? extractGradeFromSLO(targetSLO) : null;

  // Detect mode flags from enhanced Tools.tsx prompt prefix
  const isGlobalEnabled = userPrompt.includes('GLOBAL_RESOURCES_MODE: ACTIVE');
  const isCurriculumEnabled = userPrompt.includes('CURRICULUM_MODE: ACTIVE');

  // 2. Context Scoping
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

  // 3. Retrieval (Performance Optimized for Depth Scanning)
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    try {
      retrievedChunks = await retrieveRelevantChunks({
        query: userPrompt,
        documentIds: documentIds,
        supabase,
        matchCount: 50 // Increased depth for better coverage
      });
    } catch (err) {
      console.warn("⚠️ [Orchestrator] Retrieval Engine Error.");
    }
  }
  
  // 4. Vault Construction
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => {
        // High fidelity flagging for AI prioritization
        const matchTag = chunk.is_exact_match ? " [!!! PRIORITY_TARGET_MATCH: USE THIS DEFINITION !!!]" : "";
        const sourceName = activeDocs.find(d => d.id === chunk.document_id)?.name || 'Linked Library';
        return `[NODE_${i + 1}] (SOURCE: ${sourceName})${matchTag}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  } else if (activeDocs.length > 0 && isCurriculumEnabled) {
    vaultContent = `[FALLBACK_RAW] (SOURCE: ${activeDocs[0].name})\n${activeDocs[0].extracted_text?.substring(0, 8000)}`;
  }

  // 5. Instruction Synthesis
  let globalInstruction = "";
  if (isGlobalEnabled) {
    globalInstruction = `\n### 🌐 GLOBAL PEDAGOGY AUGMENTATION (ACTIVE)\nIntegrate global best practices (Finland, Singapore, Japan) while adhering strictly to the local standard's cognitive depth.\n`;
  }

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const primaryDoc = activeDocs.find(d => d.id === (priorityDocumentId || (documentIds.length > 0 ? documentIds[0] : null))) || activeDocs[0];
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, primaryDoc);

  // 6. TARGET ENFORCEMENT (V5.0: Strict Definition Lock)
  let targetEnforcement = "";
  if (targetSLO && isCurriculumEnabled) {
    targetEnforcement = `
🔴 CRITICAL_CONTEXT_LOCK: User requested synthesis for objective [${targetSLO}]. 
- Locate the chunk marked [PRIORITY_TARGET_MATCH] in the <AUTHORITATIVE_VAULT>.
- USE THAT TEXT as the definition of ${targetSLO}.
- DO NOT use Grade IV descriptions if you see "S08" or "Grade 8" in the target code.
- If the vault contains electromagnetic doorbell/speaker info for ${targetSLO}, DO NOT mention water pollution.
- IF NO MATCH FOUND: Explicitly state "Objective ${targetSLO} not found in current vault."
`;
  }

  let finalPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent}
</AUTHORITATIVE_VAULT>

${isCurriculumEnabled ? NUCLEAR_GROUNDING_DIRECTIVE : '⚠️ VAULT BYPASSED: Using General Knowledge.'}
${targetEnforcement}
${globalInstruction}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
${responseInstructions}`;

  const isComplexTask = targetSLO || toolType === 'lesson-plan' || userPrompt.length > 300;
  const preferredProvider = isComplexTask ? 'gemini' : undefined;
  
  const result = await synthesize(
    finalPrompt, 
    history.slice(-4), 
    retrievedChunks.length > 0, 
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
      isGrounded: isCurriculumEnabled && retrievedChunks.length > 0,
      isGlobal: isGlobalEnabled,
      sourceDocument: primaryDoc?.name || 'Global Library',
      extractedSLOs,
      sources: sources.length > 0 ? sources : undefined,
      gradeIsolation: isolatedGrade
    }
  };
}