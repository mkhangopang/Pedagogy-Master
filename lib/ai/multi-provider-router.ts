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
 * NEURAL SYNTHESIS ORCHESTRATOR (v42.0)
 * Optimized for SLO Isolation and Multi-Model Synergy.
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
  
  // 1. Metadata Extraction (SLO & Grade Isolation)
  const extractedSLOs = extractSLOCodes(userPrompt);
  const targetSLO = extractedSLOs.length > 0 ? extractedSLOs[0] : null;
  const isolatedGrade = targetSLO ? extractGradeFromSLO(targetSLO) : null;

  // 2. Context Scoping
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed, authority, subject, grade_level, version_year, extracted_text')
    .eq('user_id', userId)
    .eq('is_selected', true); 
  
  const activeDocs = selectedDocs || [];
  let documentIds = activeDocs.map(d => d.id) || [];
  
  if (priorityDocumentId && !documentIds.includes(priorityDocumentId)) {
    documentIds = [priorityDocumentId, ...documentIds];
  }

  // 3. Precision RAG Retrieval with Hard Grade Filtering
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    try {
      retrievedChunks = await retrieveRelevantChunks({
        query: userPrompt,
        documentIds: documentIds,
        supabase,
        matchCount: 20
      });

      // ACCURACY FIX: Hard filter by grade if an SLO is detected
      if (isolatedGrade) {
        const initialCount = retrievedChunks.length;
        retrievedChunks = retrievedChunks.filter(chunk => {
          // Keep chunk if it mentions the target grade OR has no specific grade assigned (context chunks)
          const chunkGrades = chunk.grade_levels || [];
          return chunkGrades.length === 0 || chunkGrades.includes(isolatedGrade);
        });
        if (retrievedChunks.length < initialCount) {
          console.log(`🛡️ [Isolation] Blocked ${initialCount - retrievedChunks.length} cross-grade chunks (Target Grade: ${isolatedGrade})`);
        }
      }
    } catch (err) {
      console.warn("⚠️ [Orchestrator] Vector Node Lag.");
    }
  }
  
  // 4. Authoritative Vault Construction
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => {
        const isExact = targetSLO && (chunk.slo_codes || []).includes(targetSLO);
        const tagLine = isExact ? " [!!! PRIORITY TARGET MATCH !!!]" : "";
        return `[NODE_${i + 1}] (SOURCE: ${activeDocs.find(d => d.id === chunk.document_id)?.name || 'Library'})${tagLine}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  } else if (activeDocs.length > 0) {
    const primary = activeDocs[0];
    vaultContent = `[FALLBACK] (SOURCE: ${primary.name})\n${primary.extracted_text?.substring(0, 6000)}`;
  }

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const primaryDoc = activeDocs.find(d => d.id === (priorityDocumentId || documentIds[0])) || activeDocs[0];
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, primaryDoc);

  // 5. Build Final Prompt with Strict Target Lock
  let targetEnforcement = "";
  if (targetSLO) {
    targetEnforcement = `\n🔴 CRITICAL_CONTEXT_LOCK: The user is requesting standard [${targetSLO}]. 
    You MUST search the <AUTHORITATIVE_VAULT> for this exact code. 
    IF YOU FIND S-04-A-05 but user asked for S-08-A-05, DO NOT USE the S-04 content. 
    State clearly if the specific Grade 8 standard is missing rather than defaulting to Grade 4.\n`;
  }

  let finalPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent}
</AUTHORITATIVE_VAULT>

${NUCLEAR_GROUNDING_DIRECTIVE}
${targetEnforcement}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
${responseInstructions}`;

  // 6. Dynamic Routing & Multi-Provider Synthesis
  // ACCURACY FIX: Force reasoning-heavy models for complex pedagogical creation
  const isComplexTool = ['lesson-plan', 'assessment', 'rubric', 'slo-tagger'].includes(toolType || '') || queryAnalysis.queryType === 'lesson_plan';
  const preferredProvider = isComplexTool ? 'gemini' : undefined;
  
  const result = await synthesize(
    finalPrompt, 
    history.slice(-6), 
    activeDocs.length > 0, 
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
      isGrounded: activeDocs.length > 0,
      sourceDocument: primaryDoc?.name || 'Global Library',
      extractedSLOs,
      sources: sources.length > 0 ? sources : undefined,
      gradeIsolation: isolatedGrade
    }
  };
}