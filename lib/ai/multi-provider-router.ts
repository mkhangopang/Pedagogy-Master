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
 * NEURAL SYNTHESIS ORCHESTRATOR (v21.0)
 * Optimized for high-precision grounding and multi-node resilience.
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
  
  // 1. Resolve Active Documents
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name')
    .eq('user_id', userId)
    .eq('is_selected', true)
    .eq('rag_indexed', true);
  
  const documentIds = selectedDocs?.map(d => d.id) || [];
  
  // 2. High-Precision RAG Retrieval
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase, 5, priorityDocumentId);
  }
  
  // 3. Metadata Extraction
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const extractedSLOs = extractSLOCodes(userPrompt);
  
  // 4. Clean Context Injection
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => `[SLO_NODE_${i + 1}]\nSLO_TAGS: ${chunk.slo_codes?.join(', ') || 'N/A'}\nTEXT: ${chunk.chunk_text}\n---`)
      .join('\n');
  }

  const masterSystem = customSystem || DEFAULT_MASTER_PROMPT;
  const responseInstructions = formatResponseInstructions(queryAnalysis);

  // 5. Unified System Prompt Construction
  const fullPrompt = `
${masterSystem}

<AUTHORITATIVE_VAULT>
${vaultContent || "NO DIRECT MATCHES IN VAULT. SYNTHESIZE FROM PEDAGOGICAL BEST PRACTICES."}
</AUTHORITATIVE_VAULT>

${retrievedChunks.length > 0 ? NUCLEAR_GROUNDING_DIRECTIVE : ''}

## USER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
- TOOL_TYPE: ${toolType || 'general_instruction'}
- ADAPTIVE_LAYER: ${adaptiveContext || 'standard_pedagogy'}
${responseInstructions}

## GENERATED RESPONSE:`;

  // 6. Router Logic
  const preferredProvider = (retrievedChunks.length > 0) ? 'chatgpt' : (MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'gemini');
  
  const result = await synthesize(
    fullPrompt, 
    history.slice(-6), 
    retrievedChunks.length > 0, 
    [], 
    preferredProvider,
    "You are a World-Class Pedagogical Synthesizer. Ground all output in provided curriculum standards."
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