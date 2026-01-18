
import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, MODEL_SPECIALIZATION, PROVIDERS } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * Returns the current operational status of all AI nodes.
 */
// Added missing export required by app/api/ai-status/route.ts
export function getProviderStatus() {
  return PROVIDERS.map(p => ({
    name: p.name,
    enabled: p.enabled,
    limits: { rpm: p.rpm, rpd: p.rpd },
    remaining: rateLimiter.getRemainingRequests(p.name, p)
  }));
}

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v30.0)
 * Optimized for Gemini 3 with Search Grounding and Multi-Agent Routing.
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
  
  // 1. Asset Scoping
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed')
    .eq('user_id', userId)
    .eq('is_selected', true)
    .eq('rag_indexed', true); 
  
  const documentIds = selectedDocs?.map(d => d.id) || [];
  
  // 2. RAG Retrieval
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds: priorityDocumentId ? [priorityDocumentId, ...documentIds] : documentIds,
      supabase,
      matchCount: 15
    });
  }
  
  // 3. Metadata Extraction
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const extractedSLOs = extractSLOCodes(userPrompt);
  
  // 4. Vault Construction
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => `[NODE_${i + 1}] (SLO: ${chunk.slo_codes?.join(', ') || 'General'})\n${chunk.chunk_text}\n---`)
      .join('\n');
  }

  const masterSystem = customSystem || DEFAULT_MASTER_PROMPT;
  const responseInstructions = formatResponseInstructions(queryAnalysis);

  const fullPrompt = `
${vaultContent ? `<AUTHORITATIVE_VAULT>\n${vaultContent}\n</AUTHORITATIVE_VAULT>\n\n${NUCLEAR_GROUNDING_DIRECTIVE}` : ''}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
- TASK: ${toolType || 'chat'}
- CONTEXT: ${adaptiveContext || 'standard'}
${responseInstructions}

RESPONSE:`;

  // 5. Intelligent Routing
  // Prioritize Gemini for Lesson Plans and Research queries
  const preferredProvider = (queryAnalysis.queryType === 'lesson_plan' || userPrompt.includes('research')) 
    ? 'gemini' 
    : (MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'gemini');
  
  const result = await synthesize(
    fullPrompt, 
    history.slice(-6), 
    retrievedChunks.length > 0, 
    [], 
    preferredProvider,
    masterSystem
  );
  
  // Extract external sources from Gemini Grounding
  const groundingSources = result.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    title: chunk.web?.title || 'Educational Resource',
    uri: chunk.web?.uri
  })).filter((s: any) => s.uri) || [];

  return {
    ...result,
    metadata: {
      chunksUsed: retrievedChunks.length,
      isGrounded: retrievedChunks.length > 0,
      extractedSLOs,
      sources: groundingSources
    }
  };
}
