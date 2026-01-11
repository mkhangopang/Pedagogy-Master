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
  customSystem?: string,
  priorityDocumentId?: string // New Parameter
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

  // 2. RAG RETRIEVAL (SLO-AWARE HYBRID SEARCH)
  let retrievedChunks = [];
  let retrievalMethod = 'semantic_search';

  if (documentIds.length > 0) {
    // Detect SLO pattern in user query for high-precision retrieval
    const sloPattern = /\b([A-Z])(\d{1,2})([a-z])(\d{1,2})\b/i;
    const sloMatch = userPrompt.match(sloPattern);

    if (sloMatch) {
      console.log(`[RAG] High-precision SLO lookup active: ${sloMatch[0]}`);
      retrievalMethod = 'slo_lookup';
      retrievedChunks = await retrieveChunksForSLO(sloMatch[0], documentIds, supabase);
    } else {
      // Passing priorityDocumentId for boosting
      retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase, 6, priorityDocumentId);
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
    contextVault = "# 📚 CURRICULUM CONTEXT (Retrieved from your documents):\n\n";
    retrievedChunks.forEach((chunk, idx) => {
      contextVault += `### Source Segment ${idx + 1}\n`;
      if (chunk.sectionTitle) contextVault += `**Section:** ${chunk.sectionTitle}\n`;
      if (chunk.pageNumber) contextVault += `**Page:** ${chunk.pageNumber}\n`;
      if (chunk.sloCodes?.length > 0) contextVault += `**SLOs:** ${chunk.sloCodes.join(', ')}\n`;
      contextVault += `**Relevance:** ${(chunk.similarity * 100).toFixed(1)}%\n`;
      contextVault += `--- \n${chunk.text}\n\n`;
    });
  }

  const finalPrompt = `
${hasRAG || hasMultimodal ? `🔴 LOCAL_GROUNDING_ACTIVE` : '⚠️ GLOBAL_MODE: No curriculum context found.'}

${contextVault}

# USER QUESTION:
"${userPrompt}"

# SYSTEM INSTRUCTIONS:
- You are the Pedagogy Master Neural Brain, an expert AI tutor with access to the teacher's actual curriculum.
${hasRAG ? '- Answer ONLY using the curriculum context provided above.' : '- No specific curriculum context found. Advise user to select documents.'}
${hasRAG ? '- Cite sources clearly: "According to Source 1..." or "As mentioned on Page X..."' : ''}
- When SLO codes are mentioned, highlight them: **S8c4**.
- If information is missing from documents, say: "I couldn't find information about this topic in the uploaded curriculum."
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
      retrievalMethod,
      sources: retrievedChunks.map(c => ({
        similarity: c.similarity,
        sloCodes: c.sloCodes,
        sectionTitle: c.sectionTitle,
        pageNumber: c.pageNumber
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