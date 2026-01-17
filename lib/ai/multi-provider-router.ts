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
 * NEURAL SYNTHESIS ORCHESTRATOR (v28.0 - FULL VAULT ACCESS)
 * Optimized for Authoritative Exclusive Curriculum Grounding.
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
  
  // 1. Resolved Context Selection (Fetch all indexed & selected documents)
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed')
    .eq('user_id', userId)
    .eq('is_selected', true)
    .eq('rag_indexed', true); 
  
  const documentIds = selectedDocs?.map(d => d.id) || [];
  const activeDocName = selectedDocs?.[0]?.name || "Unselected Source";
  
  // 2. Neural Retrieval (Aggregated Scoping across all selected assets)
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    // If a specific document is prioritized (e.g. from Tool View dropdown), put it first
    const searchDocs = priorityDocumentId 
      ? [priorityDocumentId, ...documentIds.filter(id => id !== priorityDocumentId)]
      : documentIds;

    retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds: searchDocs,
      supabase,
      matchCount: 25 // Maximum context depth for broad SLO visibility
    });
  }
  
  // 3. Metadata & Intent Synthesis
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const extractedSLOsFromQuery = extractSLOCodes(userPrompt);
  
  // 4. Grounding Assembly (Authoritative Vault Wrapper)
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => `[VAULT_NODE_${i + 1}]\nSLO_CODES: ${chunk.slo_codes?.join(', ') || 'N/A'}\nCONTENT: ${chunk.chunk_text}\n---`)
      .join('\n');
  }

  const masterSystem = customSystem || DEFAULT_MASTER_PROMPT;
  const responseInstructions = formatResponseInstructions(queryAnalysis);

  // 5. Instruction Synthesis (Context Lock Active)
  const fullPrompt = `
${vaultContent ? `<AUTHORITATIVE_VAULT>\nSOURCE_ASSETS: ${selectedDocs?.map(d => d.name).join(', ')}\n${vaultContent}\n</AUTHORITATIVE_VAULT>\n\n${NUCLEAR_GROUNDING_DIRECTIVE}` : ''}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
- TASK_IDENTIFIER: ${toolType || 'chat_support'}
- ADAPTIVE_LEARNING_SIGNAL: ${adaptiveContext || 'standard_teacher_profile'}
${responseInstructions}

## STRICT GENERATION DIRECTIVE:
1. YOU ARE CURRENTLY ANCHORED to the <AUTHORITATIVE_VAULT>. It is your primary source of truth.
2. IF the user asks for a specific SLO (e.g. ${extractedSLOsFromQuery.join(', ') || 'an objective'}) search carefully through all VAULT_NODES.
3. IF IT IS MISSING, inform the user you can only see specific standards and list 5 prominent SLOs you found in the nodes instead.
4. DO NOT SUMMARIZE. Synthesize specialized tools (5E Lessons, Bloom-aligned Assessments).

RESPONSE:`;

  // 6. Routing Decision Logic
  // Default to Gemini for grounded curriculum tasks due to high reasoning depth and large context handle
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
      extractedSLOs: extractedSLOsFromQuery,
      sourceDocument: activeDocName,
      totalAssets: documentIds.length
    }
  };
}
