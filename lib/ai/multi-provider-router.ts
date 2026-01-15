import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { responseCache } from './response-cache';
import { RESPONSE_LENGTH_GUIDELINES } from '../config/ai-personality';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, MODEL_SPECIALIZATION, PROVIDERS } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

export function getProviderStatus() {
  return PROVIDERS.map(p => ({
    name: p.name,
    enabled: p.enabled,
    remaining: rateLimiter.getRemainingRequests(p.name, p),
    limits: { rpm: p.rpm, rpd: p.rpd }
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

  console.log(`[RAG DEBUG] Initializing Synthesis for Query: "${userPrompt.substring(0, 50)}..."`);
  const queryAnalysis = analyzeUserQuery(userPrompt);
  
  // 2. Resolve Grounding Assets
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, authority, document_summary, grade_level, subject')
    .eq('user_id', userId)
    .or(`is_selected.eq.true${priorityDocumentId ? `,id.eq.${priorityDocumentId}` : ''}`)
    .in('status', ['ready', 'completed']);
  
  const documentIds = selectedDocs?.map(d => d.id) || [];
  console.log(`[RAG DEBUG] Active Documents In Vault: ${documentIds.length}`);
  
  // 3. RETRIEVAL (RAG Core)
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase, 15, priorityDocumentId);
    console.log(`[RAG DEBUG] Retrieved Chunks: ${retrievedChunks.length}`);
  }
  
  // 4. Build Authoritative Context (FIX: Following Diagnostic Prompt recommendations for explicit injection)
  let contextVault = "";
  const isGrounded = retrievedChunks.length > 0;
  const hasMetadata = selectedDocs && selectedDocs.length > 0;

  if (hasMetadata) {
    contextVault += `## RETRIEVED CURRICULUM ASSET METADATA:\n`;
    selectedDocs.forEach(d => {
      contextVault += `ASSET: ${d.name} | AUTHORITY: ${d.authority || 'Sindh DCAR'} | GRADE: ${d.grade_level}\nSUMMARY: ${d.document_summary || 'Curriculum resource node.'}\n\n`;
    });
  }

  if (isGrounded) {
    contextVault += `## RETRIEVED CURRICULUM CONTEXT NODES:\n`;
    retrievedChunks.forEach((chunk, i) => {
      contextVault += `[CURRICULUM CHUNK ${i + 1}]
SLO_CODES: ${chunk.sloCodes?.join(', ') || 'Global'}
CONTENT: ${chunk.text}
RELEVANCE: ${(chunk.similarity * 100).toFixed(1)}%
---
`;
    });
  }

  // 5. Orchestrate Model Selection
  const preferredProvider = (isGrounded || toolType) ? 'chatgpt' : (MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'gemini');
  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  // 6. Synthesis Prompt Injection (ABOVE User Query)
  const fullPrompt = `You are the Pedagogy Master AI with access to indexed curriculum context.

## CURRICULUM CONTEXT:
${contextVault || "NO DIRECT VAULT NODES MATCHED. USE GLOBAL PEDAGOGY STANDARDS."}

## INSTRUCTION:
Use the curriculum context provided ABOVE to answer the user's query. ALWAYS cite specific standards, units, and SLOs from the context nodes. If the context doesn't contain the specific answer, use it as a grounding framework and bridge with pedagogical expertise.

${isGrounded ? NUCLEAR_GROUNDING_DIRECTIVE : '### PEDAGOGY_MODE: Global Standards.'}
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}

## USER QUERY:
"${userPrompt}"

## YOUR RESPONSE:`;

  // 7. System Reinforcement
  let activeSystem = customSystem;
  if (!activeSystem) {
    const { data: brain } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    activeSystem = brain?.master_prompt || DEFAULT_MASTER_PROMPT;
  }

  const finalSystemInstruction = `${activeSystem}\n\nSTRICT_PROTOCOL: If CURRICULUM CONTEXT is present, you MUST prioritize it. Never claim lack of access if metadata is listed.`;
  
  const result = await synthesize(
    fullPrompt, 
    history.slice(-10), 
    isGrounded, 
    [], 
    preferredProvider, 
    finalSystemInstruction
  );
  
  responseCache.set(userPrompt, history, result.text, result.provider);
  
  return {
    ...result,
    metadata: {
      chunksUsed: retrievedChunks.length,
      isGrounded: documentIds.length > 0,
      sources: retrievedChunks.map(c => ({
        similarity: c.similarity,
        sloCodes: c.sloCodes
      }))
    }
  };
}