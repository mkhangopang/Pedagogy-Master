import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { responseCache } from './response-cache';
import { RESPONSE_LENGTH_GUIDELINES } from '../config/ai-personality';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, MODEL_SPECIALIZATION, PROVIDERS } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

// Added getProviderStatus to expose neural grid health metrics
export function getProviderStatus() {
  return PROVIDERS.map(p => ({
    name: p.name,
    enabled: p.enabled,
    limits: { rpm: p.rpm, rpd: p.rpd },
    remaining: rateLimiter.getRemainingRequests(p.name, p)
  }));
}

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
  // 1. Cache Check
  const cached = responseCache.get(userPrompt, history);
  if (cached) return { text: cached, provider: 'cache' };

  console.log(`[RAG DEBUG] Initializing Synthesis for User: ${userId}`);
  const queryAnalysis = analyzeUserQuery(userPrompt);
  
  // 2. Resolve Grounding Assets
  // FIX: Explicitly check for rag_indexed = true and correct status
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, authority, document_summary, grade_level, subject')
    .eq('user_id', userId)
    .eq('rag_indexed', true)
    .or(`is_selected.eq.true${priorityDocumentId ? `,id.eq.${priorityDocumentId}` : ''}`)
    .in('status', ['ready', 'completed']);
  
  const documentIds = selectedDocs?.map(d => d.id) || [];
  
  // 3. RETRIEVAL (RAG Core)
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase, 12, priorityDocumentId);
  }
  
  // 4. Build Authoritative Context (PROMPT CONSTRUCTION)
  let contextVault = "";
  if (retrievedChunks.length > 0) {
    retrievedChunks.forEach((chunk, i) => {
      contextVault += `[CURRICULUM CHUNK ${i + 1}]\nSLO_CODES: ${chunk.slo_codes?.join(', ') || 'None'}\nCONTENT: ${chunk.chunk_text}\n---\n`;
    });
  }

  // 5. Orchestrate Model Selection
  const preferredProvider = (retrievedChunks.length > 0 || toolType) ? 'chatgpt' : (MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'gemini');
  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  // 6. Synthesis Prompt Injection (ABOVE User Query as requested)
  const masterSystem = customSystem || DEFAULT_MASTER_PROMPT;

  const fullPrompt = `
## RETRIEVED CURRICULUM CONTEXT:
${contextVault || "NO MATCHING CURRICULUM NODES FOUND. USE GLOBAL PEDAGOGY STANDARDS."}

## MASTER SYSTEM PROMPT:
${masterSystem}

## USER QUERY:
${userPrompt}

## INSTRUCTIONS:
You MUST use the CURRICULUM CHUNKS provided ABOVE to answer. If the answer is in the chunks, cite the specific SLO codes verbatim. If context nodes are present, do not use external knowledge that contradicts them.

${retrievedChunks.length > 0 ? NUCLEAR_GROUNDING_DIRECTIVE : ''}
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}

## YOUR RESPONSE:`;

  const finalSystemInstruction = `You are a world-class pedagogy assistant. ALWAYS prioritize provided curriculum nodes.`;
  
  const result = await synthesize(
    fullPrompt, 
    history.slice(-10), 
    retrievedChunks.length > 0, 
    [], 
    preferredProvider, 
    finalSystemInstruction
  );
  
  responseCache.set(userPrompt, history, result.text, result.provider);
  
  return {
    ...result,
    metadata: {
      chunksUsed: retrievedChunks.length,
      isGrounded: retrievedChunks.length > 0,
      sources: retrievedChunks.map(c => ({
        similarity: c.combined_score,
        sloCodes: c.slo_codes
      }))
    }
  };
}