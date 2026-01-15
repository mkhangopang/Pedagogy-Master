
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
  
  // 1. Identify Context (Selection OR Priority)
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name')
    .eq('user_id', userId)
    .or(`is_selected.eq.true${priorityDocumentId ? `,id.eq.${priorityDocumentId}` : ''}`);
  
  const documentIds = selectedDocs?.map(d => d.id) || [];
  const hasSelection = documentIds.length > 0;

  // 2. RAG Memory Retrieval
  let retrievedChunks: RetrievedChunk[] = [];
  if (hasSelection) {
    retrievedChunks = await retrieveRelevantChunks(userPrompt, documentIds, supabase, 12, priorityDocumentId);
  }
  
  const isGrounded = retrievedChunks.length > 0;
  
  // Force high-fidelity Gemini when RAG is active to ensure standard compliance
  const preferredProvider = isGrounded ? 'gemini' : (MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'gemini');

  const docParts = await fetchMultimodalContext(userId, supabase);
  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  // 3. Memory Vault Construction
  let contextVault = "";
  if (isGrounded) {
    contextVault = "### 📚 AUTHORITATIVE CURRICULUM VAULT (LOCKED):\n";
    retrievedChunks.forEach((chunk, idx) => {
      contextVault += `[CHUNK_${idx + 1}] | SLO: ${chunk.sloCodes?.join(', ') || 'N/A'}\n${chunk.text}\n\n`;
    });
  }

  const finalPrompt = `
${contextVault}

# USER QUERY:
"${userPrompt}"

${isGrounded ? NUCLEAR_GROUNDING_DIRECTIVE : '### GENERAL_PEDAGOGY_WARNING: No specific curriculum nodes found. Provide general high-quality logic.'}
${isGrounded ? '- MANDATORY: Response MUST follow hierarchical Markdown (# Unit:, ## Standard:).' : ''}
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}
`;

  // Fetch active system prompt
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

  const finalSystemInstruction = `${activeSystem}\n\nPEDAGOGICAL_LOCK: If context provided, ignore general knowledge. Strictly follow Sindh dcar.gos.pk standards. Temperature ${isGrounded ? '0.1' : '0.6'}.`;
  
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
