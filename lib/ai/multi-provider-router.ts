import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { responseCache } from './response-cache';
import { SYSTEM_PERSONALITY, RESPONSE_LENGTH_GUIDELINES } from '../config/ai-personality';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, PROVIDERS, MODEL_SPECIALIZATION } from './synthesizer-core';
import { retrieveRelevantChunks, retrieveChunksForSLO } from '../rag/retriever';
import { getObjectBuffer } from '../r2';

/**
 * MULTIMODAL CONTEXT SYNCHRONIZER
 */
async function fetchMultimodalContext(userId: string, supabase: SupabaseClient) {
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .eq('is_selected', true)
    .limit(2); // Reduced limit for token efficiency

  if (!selectedDocs || selectedDocs.length === 0) return [];

  const parts = [];
  for (const doc of selectedDocs) {
    if (['application/pdf', 'image/jpeg', 'image/png'].includes(doc.mime_type)) {
      try {
        const buffer = await getObjectBuffer(doc.file_path);
        if (buffer) parts.push({ inlineData: { mimeType: doc.mime_type, data: buffer.toString('base64') } });
      } catch (e) {
        console.warn(`[Vault] Multimodal skip: ${doc.name}`);
      }
    }
  }
  return parts;
}

export async function generateAIResponse(
  userPrompt: string,
  history: any[],
  userId: string,
  supabase: SupabaseClient,
  adaptiveContext?: string,
  overrideDocPart?: any, 
  toolType?: string,
  customSystem?: string
): Promise<{ text: string; provider: string }> {
  const cached = responseCache.get(userPrompt, history);
  if (cached) return { text: cached, provider: 'cache' };

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const preferredProvider = MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'groq';

  // 1. GET SELECTED DOC IDS
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name')
    .eq('user_id', userId)
    .eq('is_selected', true);
  const documentIds = selectedDocs?.map(d => d.id) || [];

  // 2. SEMANTIC RETRIEVAL (RAG)
  let retrievedChunks = [];
  if (documentIds.length > 0) {
    if (queryAnalysis.extractedSLO) {
      retrievedChunks = await retrieveChunksForSLO(queryAnalysis.extractedSLO, documentIds, supabase);
    } else {
      retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase);
    }
  }

  const docParts = await fetchMultimodalContext(userId, supabase);
  const hasDocs = retrievedChunks.length > 0 || docParts.length > 0;
  
  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  // 3. CONTEXT ASSEMBLY - Sharpened for strict grounding
  let ragContext = "";
  if (retrievedChunks.length > 0) {
    ragContext = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    ragContext += "📚 MANDATORY SOURCE MATERIAL: <ASSET_VAULT_SEGMENTS>\n";
    ragContext += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
    retrievedChunks.forEach((chunk, i) => {
      ragContext += `[SEGMENT ${i+1}] (Semantic Relevance: ${(chunk.similarity * 100).toFixed(0)}%)\n${chunk.text}\n\n`;
    });
    ragContext += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    ragContext += "END OF ASSET VAULT\n";
    ragContext += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  }

  const finalPrompt = `
${hasDocs ? `🔴 LOCAL_GROUNDING_ACTIVE: Use the provided source segments below.` : '⚠️ GLOBAL_MODE: No curriculum documents selected.'}

${ragContext}

---
TEACHER_QUERY: ${userPrompt}
---
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}

STRICT_COMMAND: If information is found in segments, CITE the [SEGMENT X]. If not found, say "I don't find that specific information in your curriculum."
`;

  const finalSystemInstruction = `${SYSTEM_PERSONALITY}\n\n${customSystem || ''}`;
  const result = await synthesize(finalPrompt, history, hasDocs, docParts, preferredProvider, finalSystemInstruction);
  
  responseCache.set(userPrompt, history, result.text, result.provider);
  return result;
}

export function getProviderStatus() {
  return PROVIDERS.map(config => ({
    name: config.name,
    enabled: config.enabled,
    remaining: rateLimiter.getRemainingRequests(config.name, config),
    limits: { rpm: config.rpm, rpd: config.rpd }
  }));
}
