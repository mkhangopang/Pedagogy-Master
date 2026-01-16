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
 * NEURAL SYNTHESIS ORCHESTRATOR (v23.0)
 * Manages curriculum-aware routing and precision grounding.
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
  
  // 1. Context Resolution
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name')
    .eq('user_id', userId)
    .eq('is_selected', true)
    .eq('rag_indexed', true);
  
  const documentIds = selectedDocs?.map(d => d.id) || [];
  
  // 2. High-Precision Retrieval
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase, 5, priorityDocumentId);
  }
  
  // 3. Request Analysis
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const extractedSLOs = extractSLOCodes(userPrompt);
  
  // 4. Grounding Assembly
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => `[CURRICULUM_FRAGMENT_${i + 1}]\nSLO_CODES: ${chunk.slo_codes?.join(', ') || 'NONE'}\nCONTENT: ${chunk.chunk_text}\n---`)
      .join('\n');
  }

  const masterSystem = customSystem || DEFAULT_MASTER_PROMPT;
  const responseInstructions = formatResponseInstructions(queryAnalysis);

  // 5. Instruction Synthesis
  const fullPrompt = `
${vaultContent ? `<AUTHORITATIVE_VAULT>\n${vaultContent}\n</AUTHORITATIVE_VAULT>\n\n${NUCLEAR_GROUNDING_DIRECTIVE}` : ''}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION CONTEXT:
- TYPE: ${toolType || 'instructional_design'}
- ADAPTIVE_LEARNING: ${adaptiveContext || 'standard'}
${responseInstructions}

## FINAL DIRECTIVE:
Generate a pedagogical artifact strictly following the parameters above. If the vault contains specific curriculum standards for "${extractedSLOs.join(', ')}", implement them with 100% fidelity.

RESPONSE:`;

  // 6. Synthesis Routing
  // Prioritize Gemini for grounded tasks due to long-context handling
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
      extractedSLOs: extractedSLOs
    }
  };
}