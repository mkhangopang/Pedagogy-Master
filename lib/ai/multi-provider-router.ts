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
 * NEURAL SYNTHESIS ORCHESTRATOR (v49.0)
 * Optimized for Grade-Locked RAG and Multi-Segmented Standard IDs.
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

  // 3. Retrieval (High Fidelity Depth Scan)
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    try {
      retrievedChunks = await retrieveRelevantChunks({
        query: userPrompt,
        documentIds: documentIds,
        supabase,
        matchCount: 60 // Maximize coverage to find correct grade level
      });
    } catch (err) {
      console.warn("⚠️ [Orchestrator] Retrieval Pipeline Error.");
    }
  }
  
  // 4. Vault Construction
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => {
        // AI Guidance Flags
        const matchTag = chunk.is_exact_match ? " [!!! PRIORITY_TARGET_MATCH !!!]" : "";
        const gradeTag = chunk.grade_levels && chunk.grade_levels.length > 0 
          ? ` [GRADE_TAG: ${chunk.grade_levels.join(',')}]` 
          : "";
        const sourceName = activeDocs.find(d => d.id === chunk.document_id)?.name || 'Library Node';
        
        return `[NODE_${i + 1}] (SOURCE: ${sourceName})${matchTag}${gradeTag}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  } else if (activeDocs.length > 0 && isCurriculumEnabled) {
    // Fallback: If RAG index returned nothing but document is selected, use raw text slice
    vaultContent = `[FALLBACK_INDEX_FAILURE] (SOURCE: ${activeDocs[0].name})\n${activeDocs[0].extracted_text?.substring(0, 10000)}`;
  }

  // 5. Context Injections
  let globalInstruction = "";
  if (isGlobalEnabled) {
    globalInstruction = `\n### 🌐 GLOBAL PEDAGOGY AUGMENTATION (PRO)\nIntegrate instructional flow from leading international systems while strictly mapping to the local cognitive requirement.\n`;
  }

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const primaryDoc = activeDocs.find(d => d.id === (priorityDocumentId || (documentIds.length > 0 ? documentIds[0] : null))) || activeDocs[0];
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, primaryDoc);

  // 6. TARGET & GRADE ENFORCEMENT (V6.0: Strict Logical Guard)
  let targetEnforcement = "";
  if (targetSLO && isCurriculumEnabled) {
    targetEnforcement = `
🔴 CRITICAL_CONTEXT_LOCK: User requested Synthesis for [${targetSLO}] (Grade ${isolatedGrade || 'Any'}).
- VERIFY: If the target code contains "S08", do NOT use content marked as "Grade 4" or "Grade IV".
- ANCHOR: Locate the [PRIORITY_TARGET_MATCH] chunk in the vault. That is your ONLY definition of ${targetSLO}.
- If you find Grade 4 content about "Water Pollution" but the user asked for a Grade 8 code, DISCARD the Grade 4 info.
- IF NO GRADE ${isolatedGrade || ''} MATCH FOUND: State clearly that the requested grade context is missing.
`;
  }

  let finalPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent}
</AUTHORITATIVE_VAULT>

${isCurriculumEnabled ? NUCLEAR_GROUNDING_DIRECTIVE : '⚠️ VAULT BYPASSED: General Mode.'}
${targetEnforcement}
${globalInstruction}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
${responseInstructions}`;

  const isComplexTask = targetSLO || toolType === 'lesson-plan' || userPrompt.length > 300;
  const preferredProvider = 'gemini'; // Force Gemini for high-fidelity curriculum mapping
  
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
      isGrounded: isCurriculumEnabled && (retrievedChunks.length > 0 || vaultContent.includes('FALLBACK')),
      isGlobal: isGlobalEnabled,
      sourceDocument: primaryDoc?.name || 'Global Grid',
      extractedSLOs,
      sources: sources.length > 0 ? sources : undefined,
      gradeIsolation: isolatedGrade
    }
  };
}