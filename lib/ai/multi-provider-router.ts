
import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { responseCache } from './response-cache';
import { RESPONSE_LENGTH_GUIDELINES } from '../config/ai-personality';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, MODEL_SPECIALIZATION, PROVIDERS } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { getObjectBuffer } from '../r2';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * Monitors and returns the current status and rate limits of all AI providers.
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
        console.warn(`[Multimodal Skip] ${doc.name}`);
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

  // 1. Identify Context
  const { data: allDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed, status')
    .eq('user_id', userId);

  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed, status')
    .eq('user_id', userId)
    .eq('is_selected', true);
  
  const documentIds = selectedDocs && selectedDocs.length > 0 
    ? selectedDocs.map(d => d.id) 
    : (allDocs?.map(d => d.id) || []);

  // 2. RAG Memory Retrieval
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase, 10, priorityDocumentId);
  }
  
  const docParts = await fetchMultimodalContext(userId, supabase);
  const isGrounded = retrievedChunks.length > 0 || docParts.length > 0;

  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  // 3. Memory Vault Construction
  let contextVault = "";
  if (isGrounded) {
    contextVault = "# 📚 <ASSET_VAULT> (Retrieved curriculum nodes):\n\n";
    retrievedChunks.forEach((chunk, idx) => {
      contextVault += `### NODE_${idx + 1}\n`;
      if (chunk.sloCodes?.length > 0) contextVault += `**SLOs:** ${chunk.sloCodes.join(', ')}\n`;
      contextVault += `${chunk.text}\n\n`;
    });
  }

  const finalPrompt = `
${contextVault}

# TEACHER QUERY:
"${userPrompt}"

${isGrounded ? NUCLEAR_GROUNDING_DIRECTIVE : '### GENERAL_PEDAGOGY_MODE: No library matches found. Provide a high-quality general response based on best pedagogical practices.'}
${isGrounded ? '- Respond strictly using the ASSET_VAULT above.' : ''}
${isGrounded ? '- Cite sources: [NODE_X].' : ''}
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}
`;

  const finalSystemInstruction = `${customSystem || DEFAULT_MASTER_PROMPT}\n\nSTRICT_PEDAGOGY_RULES: Use 1. and 1.1 headings. NO BOLD HEADINGS. Temperature ${isGrounded ? '0.1' : '0.7'}.`;
  
  const result = await synthesize(
    finalPrompt, 
    history, 
    isGrounded, 
    docParts, 
    preferredProvider, 
    finalSystemInstruction
  );
  
  responseCache.set(userPrompt, history, result.text, result.provider);
  
  return {
    ...result,
    metadata: {
      chunksUsed: retrievedChunks.length,
      isGrounded,
      sources: retrievedChunks.map(c => ({
        similarity: c.similarity,
        sloCodes: c.sloCodes,
        pageNumber: c.pageNumber
      }))
    }
  };
}
