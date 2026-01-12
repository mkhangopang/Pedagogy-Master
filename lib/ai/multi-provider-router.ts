
import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { responseCache } from './response-cache';
import { RESPONSE_LENGTH_GUIDELINES } from '../config/ai-personality';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, MODEL_SPECIALIZATION, PROVIDERS } from './synthesizer-core';
import { retrieveRelevantChunks } from '../rag/retriever';
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
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed, status')
    .eq('user_id', userId)
    .eq('is_selected', true);
  
  const documentIds = selectedDocs?.map(d => d.id) || [];
  const documentNames = selectedDocs?.map(d => d.name) || [];

  if (documentIds.length === 0) {
    return {
      text: `📚 **Pedagogy Master**: Please select curriculum assets from the sidebar to enable synthesis grounding.`,
      provider: 'system',
    };
  }

  // 2. Check Indexing Health
  const unindexedDocs = selectedDocs?.filter(d => !d.rag_indexed && d.status !== 'ready') || [];
  if (unindexedDocs.length > 0 && selectedDocs?.length === unindexedDocs.length) {
    return {
      text: `⏳ **Pedagogy Master**: Selected assets are being indexed for neural search. Please wait 10-20 seconds.`,
      provider: 'system',
    };
  }

  // 3. RAG Memory Retrieval
  const retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase, 10, priorityDocumentId);
  const docParts = await fetchMultimodalContext(userId, supabase);
  
  if (retrievedChunks.length === 0 && docParts.length === 0) {
    return {
      text: `**DATA_UNAVAILABLE**: I searched ${documentNames.join(', ')} but found no relevant content for: "${userPrompt}"\n\n**Suggestions**:\n- Check that the topic is in your files.\n- Try search for SLO code.\n- Use **Sync Neural Nodes** in the Library.`,
      provider: 'system',
    };
  }

  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  // 4. Memory Vault Construction
  let contextVault = "# 📚 <ASSET_VAULT> (Retrieved curriculum nodes):\n\n";
  retrievedChunks.forEach((chunk, idx) => {
    contextVault += `### NODE_${idx + 1}\n`;
    if (chunk.sloCodes?.length > 0) contextVault += `**SLOs:** ${chunk.sloCodes.join(', ')}\n`;
    contextVault += `${chunk.text}\n\n`;
  });

  const finalPrompt = `
${contextVault}

# TEACHER QUERY:
"${userPrompt}"

${NUCLEAR_GROUNDING_DIRECTIVE}
- Respond strictly using the ASSET_VAULT above.
- Cite sources: [NODE_X].
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}
`;

  const finalSystemInstruction = `${customSystem || DEFAULT_MASTER_PROMPT}\n\nSTRICT_PEDAGOGY_RULES: Use 1. and 1.1 headings. NO BOLD HEADINGS. Temperature 0.1 for document grounding.`;
  
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
