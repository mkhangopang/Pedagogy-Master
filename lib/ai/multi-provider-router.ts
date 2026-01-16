
import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, MODEL_SPECIALIZATION, PROVIDERS } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk, extractSLOCodes } from '../rag/retriever';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

export function getProviderStatus() {
  return PROVIDERS.map(p => ({
    name: p.name,
    enabled: p.enabled,
    limits: { rpm: p.rpm, rpd: p.rpd },
    remaining: rateLimiter.getRemainingRequests(p.name, p)
  }));
}

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v26.0 - HIGH PRECISION)
 * Optimized for Exclusive Curriculum Grounding & Pedagogical Generation.
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
  
  // 1. Context Selection (Strict Active Filter)
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed')
    .eq('user_id', userId)
    .eq('is_selected', true)
    .eq('rag_indexed', true); // Only trust indexed documents
  
  const documentIds = selectedDocs?.map(d => d.id) || [];
  const activeDocName = selectedDocs?.[0]?.name || "Unselected Source";
  
  // 2. Neural Retrieval
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    // Priority: Respect user click/focus, otherwise use the selected set
    const searchScope = priorityDocumentId ? [priorityDocumentId] : documentIds;
    // Fix: retrieveRelevantChunks expects a single object argument with specific keys.
    retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentId: searchScope[0],
      supabase,
      matchCount: 4
    });
  }
  
  // 3. User Intent Extraction
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const extractedSLOs = extractSLOCodes(userPrompt);
  
  // 4. Grounding Assembly (Authoritative Vault)
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => `[SLO_NODE_${i + 1}]\nSLO_CODES: ${chunk.slo_codes?.join(', ') || 'General'}\nCONTENT: ${chunk.chunk_text}\n---`)
      .join('\n');
  }

  const masterSystem = customSystem || DEFAULT_MASTER_PROMPT;
  const responseInstructions = formatResponseInstructions(queryAnalysis);

  // 5. Instruction Synthesis (Strict Generation Lock)
  const fullPrompt = `
${vaultContent ? `<AUTHORITATIVE_VAULT>\nSOURCE_ASSET: ${activeDocName}\n${vaultContent}\n</AUTHORITATIVE_VAULT>\n\n${NUCLEAR_GROUNDING_DIRECTIVE}` : ''}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
- TASK_TYPE: ${toolType || 'pedagogical_tool_generation'}
- ADAPTIVE_LEARNING_SIGNAL: ${adaptiveContext || 'standard'}
${responseInstructions}

## GENERATION DIRECTIVE (CRITICAL):
1. IF <AUTHORITATIVE_VAULT> matches any of these SLOs [${extractedSLOs.join(', ')}], use the vault text as your LEARNING OBJECTIVE.
2. DO NOT SUMMARIZE. Your goal is to CREATE NEW PEDAGOGICAL CONTENT (Lesson Plans, Questions, Rubrics).
3. Apply world-class framework: ${toolType === 'lesson-plan' ? '5E Model (Engage, Explore, Explain, Elaborate, Evaluate)' : 'Bloom\'s Taxonomy'}.
4. Target the appropriate grade level found in the vault metadata.

RESPONSE:`;

  // 6. Synthesis Routing
  const preferredProvider = (retrievedChunks.length > 0) ? 'gemini' : (MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'gemini');
  
  const result = await synthesize(
    fullPrompt, 
    history.slice(-6), 
    retrievedChunks.length > 0, 
    [], 
    preferredProvider,
    masterSystem
  );
  
  return {
    ...result,
    metadata: {
      chunksUsed: retrievedChunks.length,
      isGrounded: retrievedChunks.length > 0,
      extractedSLOs: extractedSLOs,
      sourceDocument: activeDocName
    }
  };
}
