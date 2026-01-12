import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { responseCache } from './response-cache';
import { SYSTEM_PERSONALITY, RESPONSE_LENGTH_GUIDELINES } from '../config/ai-personality';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, MODEL_SPECIALIZATION, PROVIDERS } from './synthesizer-core';
import { retrieveRelevantChunks } from '../rag/retriever';
import { getObjectBuffer } from '../r2';

/**
 * Monitors and returns the current status and rate limits of all AI providers.
 * Used by the ProviderStatusBar component to display node health.
 */
export function getProviderStatus() {
  return PROVIDERS.map(p => ({
    name: p.name,
    enabled: p.enabled,
    limits: { rpm: p.rpm, rpd: p.rpd },
    remaining: rateLimiter.getRemainingRequests(p.name, p)
  }));
}

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
  priorityDocumentId?: string
): Promise<{ text: string; provider: string; metadata?: any }> {
  const cached = responseCache.get(userPrompt, history);
  if (cached) return { text: cached, provider: 'cache' };

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const preferredProvider = MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'gemini';

  // 1. IDENTIFY CONTEXT
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed, status')
    .eq('user_id', userId)
    .eq('is_selected', true);
  
  const documentIds = selectedDocs?.map(d => d.id) || [];
  const documentNames = selectedDocs?.map(d => d.name) || [];

  if (documentIds.length === 0) {
    return {
      text: `📚 Please select a curriculum document from the sidebar.\n\nI see you have documents available, but none are currently active for this chat session.`,
      provider: 'system',
    };
  }

  // 2. CHECK INDEXING STATUS
  const unindexedDocs = selectedDocs?.filter(d => !d.rag_indexed && d.status !== 'ready') || [];
  if (unindexedDocs.length > 0 && selectedDocs?.length === unindexedDocs.length) {
    return {
      text: `⏳ Your selected assets are still being processed for neural search.\n\nStatus: [${unindexedDocs.map(d => d.name).join(', ')}] are indexing. Please wait 10-20 seconds.`,
      provider: 'system',
    };
  }

  // 3. RAG SEARCH
  const retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase, 8, priorityDocumentId);
  const docParts = await fetchMultimodalContext(userId, supabase);
  
  const hasRAG = retrievedChunks.length > 0;
  const hasMultimodal = docParts.length > 0;

  if (!hasRAG && !hasMultimodal) {
    return {
      text: `DATA_UNAVAILABLE: I searched your selected curriculum assets (${documentNames.join(', ')}) but couldn't find relevant information for: "${userPrompt}"\n\nTips:\n- Ensure the topic is covered in the uploaded documents.\n- Try searching for specific learning codes (SLOs).\n- Use the "Brain Control" panel to re-index all documents if you recently uploaded them.`,
      provider: 'system',
    };
  }

  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  // 4. CONTEXT ASSEMBLY
  let contextVault = "# 📚 CURRICULUM CONTEXT (Retrieved from your documents):\n\n";
  retrievedChunks.forEach((chunk, idx) => {
    contextVault += `### Segment ${idx + 1}\n`;
    if (chunk.sloCodes?.length > 0) contextVault += `**SLOs:** ${chunk.sloCodes.join(', ')}\n`;
    contextVault += `--- \n${chunk.text}\n\n`;
  });

  const finalPrompt = `
🔴 LOCAL_GROUNDING_ACTIVE

${contextVault}

# USER QUESTION:
"${userPrompt}"

# SYSTEM INSTRUCTIONS:
- You are the Pedagogy Master AI.
- Answer ONLY using the curriculum context provided above.
- Cite sources clearly: "According to [filename]..."
- When SLO codes are mentioned, highlight them: **S8c4**.
- If info is missing from the provided context, say: "DATA_UNAVAILABLE".
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}
`;

  const finalSystemInstruction = `${SYSTEM_PERSONALITY}\n\n${customSystem || ''}`;
  
  const result = await synthesize(
    finalPrompt, 
    history, 
    true, 
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
        sloCodes: c.sloCodes,
        pageNumber: c.pageNumber
      }))
    }
  };
}
