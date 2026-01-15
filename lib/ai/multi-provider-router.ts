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

  const queryAnalysis = analyzeUserQuery(userPrompt);
  
  // 2. Resolve Selected Documents
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, authority, document_summary, grade_level, subject')
    .eq('user_id', userId)
    .or(`is_selected.eq.true${priorityDocumentId ? `,id.eq.${priorityDocumentId}` : ''}`)
    .in('status', ['ready', 'completed']);
  
  const documentIds = selectedDocs?.map(d => d.id) || [];
  
  // 3. RETRIEVAL (RAG Core)
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    console.log(`[RAG DEBUG] Query: "${userPrompt.substring(0, 50)}..."`);
    console.log(`[RAG DEBUG] Selected IDs: ${documentIds.join(', ')}`);
    retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase, 15, priorityDocumentId);
    console.log(`[RAG DEBUG] Chunks Found: ${retrievedChunks.length}`);
  }
  
  // 4. Build Authoritative Context Vault
  let contextVault = "";
  const isGrounded = retrievedChunks.length > 0;
  const hasMetadata = selectedDocs && selectedDocs.length > 0;

  if (hasMetadata) {
    contextVault = `### 🏛️ AUTHORITATIVE_VAULT_METADATA\n`;
    selectedDocs.forEach(d => {
      contextVault += `ASSET: ${d.name} | AUTHORITY: ${d.authority || 'Sindh DCAR'} | SUBJECT: ${d.subject}\nCORE_SUMMARY: ${d.document_summary || 'Curriculum resource node.'}\n\n`;
    });
    contextVault += `### END_METADATA\n\n`;
  }

  if (isGrounded) {
    contextVault += `### 📚 KNOWLEDGE_NODES (STRICT SOURCE OF TRUTH)\n`;
    retrievedChunks.forEach((chunk, idx) => {
      contextVault += `[NODE_${idx + 1}] SLO_TAGS: ${chunk.sloCodes?.join(', ') || 'N/A'}\nCONTENT: ${chunk.text}\n\n`;
    });
    contextVault += `### END_NODES\n`;
  }

  // 5. Orchestrate Model Selection
  const preferredProvider = (isGrounded || toolType) ? 'gemini' : (MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'gemini');
  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  // 6. Synthesis Prompt Injection (ABOVE Query)
  const finalPrompt = `
${contextVault}

# USER_QUERY:
"${userPrompt}"

${isGrounded ? NUCLEAR_GROUNDING_DIRECTIVE : '### PEDAGOGY_MODE: Global Standards. (Note: No matching nodes found in vault for this specific query).'}
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}
`;

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

  // Enforce the "Hierarchy of Truth" protocol
  const finalSystemInstruction = `${activeSystem}\n\nSTRICT_GROUNDING_PROTOCOL: If AUTHORITATIVE_VAULT_METADATA is present, you HAVE access to the curriculum. Never claim otherwise. Always prioritize provided ASSET METADATA and KNOWLEDGE_NODES over training data.`;
  
  const result = await synthesize(
    finalPrompt, 
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