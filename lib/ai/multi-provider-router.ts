
import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, MODEL_SPECIALIZATION, PROVIDERS } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * Returns the current operational status of all AI nodes.
 */
export function getProviderStatus() {
  return PROVIDERS.map(p => ({
    name: p.name,
    enabled: p.enabled,
    limits: { rpm: p.rpm, rpd: p.rpd },
    remaining: rateLimiter.getRemainingRequests(p.name, p)
  }));
}

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v32.0)
 * Optimized for Gemini 3 with Metadata-Driven Tool Synthesis.
 */
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
  
  // 1. Context Scoping
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed, authority, subject, grade_level, version_year')
    .eq('user_id', userId)
    .eq('is_selected', true); 
  
  const activeDocs = selectedDocs || [];
  const documentIds = activeDocs.map(d => d.id) || [];
  
  // 2. Context Enforcement Check
  if (documentIds.length === 0) {
    return {
      text: "> ⚠️ **CONTEXT NOT SYNCED**: You haven't selected a curriculum asset yet. \n\nTo generate precise lesson plans, assessments, or rubrics grounded in your specific standards, please **select a document from the 'Curriculum Assets' sidebar** first. \n\nOnce selected, I will automatically anchor all synthesis to your verified SLOs and board requirements.",
      provider: 'orchestrator',
      metadata: { isGrounded: false, chunksUsed: 0 }
    };
  }

  // 3. RAG Retrieval
  let retrievedChunks: RetrievedChunk[] = [];
  retrievedChunks = await retrieveRelevantChunks({
    query: userPrompt,
    documentIds: priorityDocumentId ? [priorityDocumentId, ...documentIds] : documentIds,
    supabase,
    matchCount: 15
  });
  
  // 4. Metadata Extraction
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const extractedSLOs = extractSLOCodes(userPrompt);
  
  // 5. Authoritative Vault Construction
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => `[NODE_${i + 1}] (SOURCE: ${activeDocs.find(d => d.id === (chunk as any).document_id)?.name || 'Library'})\n${chunk.chunk_text}\n---`)
      .join('\n');
  }

  // Inject primary document metadata into instructions
  const primaryDoc = activeDocs.find(d => d.id === (priorityDocumentId || documentIds[0])) || activeDocs[0];
  const masterSystem = customSystem || DEFAULT_MASTER_PROMPT;
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, primaryDoc);

  const fullPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent || "ERROR: NO DATA FOUND IN SELECTED ASSETS. WARN USER."}
</AUTHORITATIVE_VAULT>

${NUCLEAR_GROUNDING_DIRECTIVE}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
- TASK_ENGINE: ${toolType || 'chat'}
- GROUNDING_LEVEL: AUTHORITATIVE
${responseInstructions}

RESPONSE:`;

  // 6. Intelligent Routing
  const preferredProvider = (queryAnalysis.queryType === 'lesson_plan' || toolType === 'lesson-plan' || userPrompt.includes('research')) 
    ? 'gemini' 
    : (MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'gemini');
  
  const result = await synthesize(
    fullPrompt, 
    history.slice(-6), 
    retrievedChunks.length > 0, 
    [], 
    preferredProvider,
    masterSystem
  );
  
  // 7. Grounding Metadata Extraction
  const groundingSources = result.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    title: chunk.web?.title || 'Educational Resource',
    uri: chunk.web?.uri
  })).filter((s: any) => s.uri) || [];

  return {
    ...result,
    metadata: {
      chunksUsed: retrievedChunks.length,
      isGrounded: true,
      sourceDocument: primaryDoc?.name || 'Curriculum Library',
      extractedSLOs,
      sources: groundingSources
    }
  };
}
