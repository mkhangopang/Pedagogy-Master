import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, getProvidersConfig } from './synthesizer-core';
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
 * NEURAL SYNTHESIS ORCHESTRATOR (v40.0)
 * Logic for routing complex pedagogical extractions with multi-provider failover.
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
  
  // 2. Metadata Extraction
  const extractedSLOs = extractSLOCodes(userPrompt);
  const targetSLO = extractedSLOs.length > 0 ? extractedSLOs[0] : null;

  // 3. Precision RAG Retrieval (Optional for Visual Aid, Mandatory for others)
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    try {
      retrievedChunks = await retrieveRelevantChunks({
        query: userPrompt,
        documentIds: documentIds,
        supabase,
        matchCount: toolType === 'visual-aid' ? 5 : 20 
      });
    } catch (err) {
      console.warn("⚠️ [Orchestrator] Vector Node Lag.");
    }
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
  } else if (activeDocs.length > 0) {
    const primary = activeDocs[0];
    vaultContent = `[FALLBACK] (SOURCE: ${primary.name})\n${primary.extracted_text?.substring(0, 6000)}`;
  }

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const primaryDoc = activeDocs.find(d => d.id === (priorityDocumentId || documentIds[0])) || activeDocs[0];
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, primaryDoc);

  // 5. Visual Aid Specific Prompting
  let finalPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent}
</AUTHORITATIVE_VAULT>

${NUCLEAR_GROUNDING_DIRECTIVE}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
${responseInstructions}`;

  if (toolType === 'visual-aid') {
    finalPrompt += `\n\n### RESOURCE PROTOCOL:
1. Locate 3-5 verified clickable links to Creative Commons images, diagrams, or archival media for this specific curriculum topic.
2. Preferred sources: Unsplash, Pexels, Pixabay, Wikimedia Commons.
3. For each link, explain how it supports the Student Learning Objective.
4. If the model is not Gemini, provide high-quality resource nodes from internal training data that are known to be stable.`;
  }

  // 6. Dynamic Routing & Multi-Provider Synthesis
  // Preferred Gemini for Visual/Complex tools, but ALLOW FAILOVER to Groq/Cerebras
  const isComplexTool = toolType && ['lesson-plan', 'assessment', 'rubric', 'slo-tagger', 'visual-aid'].includes(toolType);
  const preferredProvider = isComplexTool ? 'gemini' : undefined;
  
  const result = await synthesize(
    finalPrompt, 
    history.slice(-6), 
    activeDocs.length > 0, 
    [], 
    preferredProvider,
    customSystem || DEFAULT_MASTER_PROMPT
  );
  
  // Extract grounding if available
  const sources = [
    ...(result.groundingMetadata?.groundingChunks?.map((c: any) => c.web).filter(Boolean) || []),
    ...(result.groundingMetadata?.groundingChunks?.map((c: any) => c.maps).filter(Boolean) || [])
  ];

  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      chunksUsed: retrievedChunks.length,
      isGrounded: activeDocs.length > 0,
      sourceDocument: primaryDoc?.name || 'Global Library',
      extractedSLOs,
      sources: sources.length > 0 ? sources : undefined
    }
  };
}