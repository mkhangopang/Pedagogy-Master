import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, MODEL_SPECIALIZATION, getProvidersConfig } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * Provides status of all configured AI nodes.
 */
export async function getProviderStatus() {
  const configs = getProvidersConfig();
  return Promise.all(configs.map(async (config) => {
    const remaining = await rateLimiter.getRemainingRequests(config.name, config);
    return {
      name: config.name,
      enabled: config.enabled,
      remaining,
      limits: { rpm: config.rpm, rpd: config.rpd }
    };
  }));
}

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v38.0)
 * Logic for routing complex pedagogical extractions to high-reasoning nodes.
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
    .select('id, name, rag_indexed, authority, subject, grade_level, version_year, extracted_text')
    .eq('user_id', userId)
    .eq('is_selected', true); 
  
  const activeDocs = selectedDocs || [];
  let documentIds = activeDocs.map(d => d.id) || [];
  
  if (priorityDocumentId && !documentIds.includes(priorityDocumentId)) {
    documentIds = [priorityDocumentId, ...documentIds];
    const { data: priorityDocInfo } = await supabase
      .from('documents')
      .select('id, name, rag_indexed, authority, subject, grade_level, version_year, extracted_text')
      .eq('id', priorityDocumentId)
      .single();
    if (priorityDocInfo) activeDocs.push(priorityDocInfo);
  }
  
  if (documentIds.length === 0) {
    return {
      text: "> ⚠️ **CONTEXT NOT SYNCED**: Please select a curriculum asset from the sidebar.",
      provider: 'orchestrator'
    };
  }

  // 2. Metadata Extraction
  const extractedSLOs = extractSLOCodes(userPrompt);
  const targetSLO = extractedSLOs.length > 0 ? extractedSLOs[0] : null;

  // 3. Precision RAG Retrieval
  let retrievedChunks: RetrievedChunk[] = [];
  try {
    retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds: documentIds,
      supabase,
      matchCount: 20 
    });
  } catch (err) {
    console.warn("⚠️ [Orchestrator] Vector Node Lag.");
  }
  
  // 4. Authoritative Vault Construction
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => {
        const isExact = targetSLO && chunk.slo_codes.includes(targetSLO);
        const tagLine = isExact ? " [!!! TARGET MATCH !!!]" : "";
        return `[NODE_${i + 1}] (SOURCE: ${activeDocs.find(d => d.id === chunk.document_id)?.name || 'Library'})${tagLine}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  } else {
    const primary = activeDocs[0];
    vaultContent = `[FALLBACK] (SOURCE: ${primary.name})\n${primary.extracted_text?.substring(0, 6000)}`;
  }

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const primaryDoc = activeDocs.find(d => d.id === (priorityDocumentId || documentIds[0])) || activeDocs[0];
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, primaryDoc);

  // 5. Hard-Anchor Directive
  const strictLock = targetSLO ? `
🚨 STRICT STANDARD LOCK: ON 🚨
User is requesting analysis for SLO: **${targetSLO}**.
Locate [!!! TARGET MATCH !!!]. If the description contains multiple clauses, synthesize the cognitive level for the MOST COMPLEX clause.
` : '';

  const fullPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent}
</AUTHORITATIVE_VAULT>

${NUCLEAR_GROUNDING_DIRECTIVE}
${strictLock}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
${responseInstructions}

RESPONSE:`;

  // FORCE GEMINI FOR PEDAGOGICAL TOOLS
  // Added 'slo-tagger' to the mandatory Gemini list
  const isComplexTool = toolType && ['lesson-plan', 'assessment', 'rubric', 'slo-tagger', 'visual-aid'].includes(toolType);
  const preferredProvider = (isComplexTool || queryAnalysis.queryType === 'lesson_plan') ? 'gemini' : 'groq';
  
  const result = await synthesize(
    fullPrompt, 
    history.slice(-6), 
    true, 
    [], 
    preferredProvider,
    customSystem || DEFAULT_MASTER_PROMPT
  );
  
  const sources = [
    ...(result.groundingMetadata?.groundingChunks?.map((c: any) => c.web).filter(Boolean) || []),
    ...(result.groundingMetadata?.groundingChunks?.map((c: any) => c.maps).filter(Boolean) || [])
  ];

  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      chunksUsed: retrievedChunks.length,
      isGrounded: true,
      sourceDocument: primaryDoc?.name,
      extractedSLOs,
      sources: sources.length > 0 ? sources : undefined
    }
  };
}