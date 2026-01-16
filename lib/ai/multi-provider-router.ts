import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { responseCache } from './response-cache';
import { RESPONSE_LENGTH_GUIDELINES } from '../config/ai-personality';
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
 * NEURAL SYNTHESIS ORCHESTRATOR (v19.0)
 * Operates as a Pedagogical Tool Factory. 
 * Uses RAG to find the SLO "seed" and the Neural Brain to generate tools.
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
  
  // 1. Intelligent Intent Analysis
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const extractedSLOs = extractSLOCodes(userPrompt);
  
  // 2. Resolve Active Curriculum Grid
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, authority, grade_level, subject')
    .eq('user_id', userId)
    .eq('rag_indexed', true)
    .or(`is_selected.eq.true${priorityDocumentId ? `,id.eq.${priorityDocumentId}` : ''}`)
    .in('status', ['ready', 'completed']);
  
  const documentIds = selectedDocs?.map(d => d.id) || [];
  
  // 3. RAG: Seed Extraction
  // We reduce matchCount to 5 to ensure we only get the most relevant SLO definitions.
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase, 5, priorityDocumentId);
  }
  
  // 4. MINIMAL CONTEXT INJECTION (The Seed)
  let authoritativeVault = "";
  if (retrievedChunks.length > 0) {
    authoritativeVault = retrievedChunks
      .map((chunk, i) => `[SLO_NODE ${i + 1}]\nCODES: ${chunk.slo_codes?.join(', ') || 'General'}\nDEFINITION: ${chunk.chunk_text}\n---`)
      .join('\n');
  }

  // 5. Grid Provider Routing
  const preferredProvider = (retrievedChunks.length > 0 || toolType) ? 'chatgpt' : (MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'gemini');
  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  // 6. Synthesis Prompt Orchestration (ABOVE query)
  const masterSystem = customSystem || DEFAULT_MASTER_PROMPT;

  const fullPrompt = `
## AUTHORITATIVE_VAULT (Curriculum Seeds):
${authoritativeVault || "NO SPECIFIC SLO NODES DETECTED. SYNTHESIZING FROM PEDAGOGICAL DEFAULTS."}

## MASTER SYSTEM PROMPT:
${masterSystem}

## USER TOOL REQUEST:
"${userPrompt}"

## INSTRUCTIONS:
1. Identify the targeted SLO from the <AUTHORITATIVE_VAULT>.
2. Use that objective as the foundation for synthesis.
3. Apply the 5E Instructional Model and Bloom's Taxonomy.
4. DO NOT summarize the document; GENERATE a NEW, structured pedagogical tool.
${retrievedChunks.length > 0 ? NUCLEAR_GROUNDING_DIRECTIVE : ''}
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}

## GENERATED TOOL:`;

  // 7. Execute Synthesis via Multi-Provider Grid
  const finalSystemInstruction = `You are a World-Class Pedagogical Architect. Use provided SLO definitions to construct high-impact tools.`;
  
  const result = await synthesize(
    fullPrompt, 
    history.slice(-6), // Tighter history for tool focus
    retrievedChunks.length > 0, 
    [], 
    preferredProvider, 
    finalSystemInstruction
  );
  
  return {
    ...result,
    metadata: {
      chunksUsed: retrievedChunks.length,
      isGrounded: retrievedChunks.length > 0,
      extractedSLOs: extractedSLOs,
      sources: retrievedChunks.map(c => ({
        similarity: c.combined_score,
        sloCodes: c.slo_codes
      }))
    }
  };
}