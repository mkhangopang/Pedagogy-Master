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
    .limit(2);

  if (!selectedDocs || selectedDocs.length === 0) return [];

  const parts = [];
  for (const doc of selectedDocs) {
    if (['application/pdf', 'image/jpeg', 'image/png'].includes(doc.mime_type)) {
      try {
        const buffer = await getObjectBuffer(doc.file_path);
        if (buffer) {
          parts.push({ 
            inlineData: { 
              mimeType: doc.mime_type, 
              data: buffer.toString('base64') 
            } 
          });
        }
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
): Promise<{ text: string; provider: string; metadata?: any }> {
  const cached = responseCache.get(userPrompt, history);
  if (cached) return { text: cached, provider: 'cache' };

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const preferredProvider = MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'gemini';

  // 1. IDENTIFY CONTEXT
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name')
    .eq('user_id', userId)
    .eq('is_selected', true);
  const documentIds = selectedDocs?.map(d => d.id) || [];

  // 2. RAG RETRIEVAL
  let retrievedChunks = [];
  if (documentIds.length > 0) {
    console.log(`[RAG] Querying vault for: ${userPrompt.substring(0, 50)}...`);
    if (queryAnalysis.extractedSLO) {
      retrievedChunks = await retrieveChunksForSLO(queryAnalysis.extractedSLO, documentIds, supabase);
    } else {
      retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase, 6);
    }
  }

  const docParts = await fetchMultimodalContext(userId, supabase);
  const hasRAG = retrievedChunks.length > 0;
  const hasMultimodal = docParts.length > 0;
  
  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  // 3. CONTEXT ASSEMBLY
  let contextVault = "";
  if (hasRAG) {
    contextVault = "# CURRICULUM CONTEXT (Retrieved from selected documents):\n\n";
    retrievedChunks.forEach((chunk, idx) => {
      contextVault += `## Source Segment ${idx + 1}\n`;
      contextVault += `Relevance: ${(chunk.similarity * 100).toFixed(1)}%\n`;
      if (chunk.sloCodes?.length > 0) contextVault += `Related SLOs: ${chunk.sloCodes.join(', ')}\n`;
      contextVault += `Content:\n${chunk.text}\n\n---\n\n`;
    });
  }

  const finalPrompt = `
${hasRAG || hasMultimodal ? `🔴 LOCAL_GROUNDING_ACTIVE` : '⚠️ GLOBAL_MODE: No specific curriculum context found.'}

${contextVault}

# USER QUESTION:
${userPrompt}

# SYSTEM INSTRUCTIONS:
- You are the Pedagogy Master Neural Brain.
${hasRAG ? '- USE ONLY the provided curriculum context above to answer.' : '- You do not have specific curriculum segments for this query. Provide general pedagogical guidance but suggest the user select relevant documents.'}
${hasRAG ? '- CITE your sources using [Source Segment X] notation.' : ''}
- If the context doesn't contain the answer, say "I don't find that specific information in your current curriculum documents."
- Highlight any Student Learning Objectives (SLOs) found in the text.
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}
`;

  const finalSystemInstruction = `${SYSTEM_PERSONALITY}\n\n${customSystem || ''}`;
  
  const result = await synthesize(
    finalPrompt, 
    history, 
    hasRAG || hasMultimodal, 
    docParts, 
    preferredProvider, 
    finalSystemInstruction
  );
  
  responseCache.set(userPrompt, history, result.text, result.provider);
  
  return {
    ...result,
    metadata: {
      chunksUsed: retrievedChunks.length,
      sources: retrievedChunks.map(c => ({
        similarity: c.similarity,
        sloCodes: c.sloCodes
      }))
    }
  };
}

export function getProviderStatus() {
  return PROVIDERS.map(config => ({
    name: config.name,
    enabled: config.enabled,
    remaining: rateLimiter.getRemainingRequests(config.name, config),
    limits: { rpm: config.rpm, rpd: config.rpd }
  }));
}
