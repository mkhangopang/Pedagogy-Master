import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { responseCache } from './response-cache';
import { SYSTEM_PERSONALITY, RESPONSE_LENGTH_GUIDELINES } from '../config/ai-personality';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { fetchAndIndexDocuments, buildDocumentAwarePrompt } from '../documents/document-processor-runtime';
import { getCachedOrGenerate } from './intelligent-cache';
import { generateLearningPath } from './learning-path';
import { synthesize, PROVIDERS, MODEL_SPECIALIZATION } from './synthesizer-core';
import { getObjectBuffer } from '../r2';

/**
 * ASSET VAULT SYNCHRONIZER
 * Fetches raw assets from R2 for multimodal grounding.
 */
async function fetchMultimodalContext(userId: string, supabase: SupabaseClient) {
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .eq('is_selected', true)
    .limit(5);

  if (!selectedDocs || selectedDocs.length === 0) return [];

  const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const parts = [];

  for (const doc of selectedDocs) {
    if (!supportedTypes.includes(doc.mime_type)) continue;
    
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
      console.warn(`[Vault Warning] Skipping asset ${doc.name}`);
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

  // CORE RAG FETCHING
  const documentIndex = await fetchAndIndexDocuments(userId);
  const docParts = await fetchMultimodalContext(userId, supabase);
  
  // Fetch detailed metadata from DB for selected docs
  const { data: docMetadata } = await supabase
    .from('documents')
    .select('name, document_summary, difficulty_level, key_topics')
    .eq('user_id', userId)
    .eq('is_selected', true);

  const hasDocs = documentIndex.documentCount > 0 || docParts.length > 0;
  
  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  const { prompt: enhancedPrompt } = buildDocumentAwarePrompt(userPrompt, documentIndex);

  // CONTEXT ASSEMBLY - Sharpened for interactive grounding
  let documentContext = "";
  if (docMetadata && docMetadata.length > 0) {
    documentContext = "📚 <ASSET_VAULT_INTELLIGENCE>\n";
    docMetadata.forEach(meta => {
      documentContext += `FILE: ${meta.name}\nSUMMARY: ${meta.document_summary || 'Analysis pending...'}\nTOPICS: ${meta.key_topics?.join(', ') || 'N/A'}\nGRADE_LEVEL: ${meta.difficulty_level || 'N/A'}\n\n`;
    });
    documentContext += "</ASSET_VAULT_INTELLIGENCE>\n";
  }

  if (documentIndex.documentCount > 0) {
    documentContext += "📖 <RAW_CURRICULUM_EXTRACTS>\n" + 
      documentIndex.documents.map(d => `SOURCE: ${d.filename}\nCONTENT:\n${d.content}`).join('\n\n') +
      "\n</RAW_CURRICULUM_EXTRACTS>";
  }

  const finalPrompt = `
${hasDocs ? `🔴 ATTACHED_DOCUMENTS_PRESENT\n${documentContext}` : '⚠️ NO_LOCAL_DOCUMENTS_DETECTED'}
---
TEACHER_QUERY: ${enhancedPrompt}
---
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}

STRICT_COMMAND: If documents are present above, your response MUST originate 100% from them. If they are missing the answer, say DATA_UNAVAILABLE.
`;

  // Merge personality with custom master prompt from Brain settings
  const finalSystemInstruction = `${SYSTEM_PERSONALITY}\n\n${customSystem || ''}`;

  const result = await synthesize(finalPrompt, history, hasDocs, docParts, preferredProvider, finalSystemInstruction);
  responseCache.set(userPrompt, history, result.text, result.provider);
  return result;
}

/**
 * GET PROVIDER STATUS
 * Returns the current health and rate limit status of all configured AI providers.
 */
export function getProviderStatus() {
  return PROVIDERS.map(config => ({
    name: config.name,
    enabled: config.enabled,
    remaining: rateLimiter.getRemainingRequests(config.name, config),
    limits: { rpm: config.rpm, rpd: config.rpd }
  }));
}
