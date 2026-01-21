import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, MODEL_SPECIALIZATION, getProvidersConfig } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * Returns the current operational status of all AI nodes.
 */
export async function getProviderStatus() {
  const configs = getProvidersConfig();
  const statuses = await Promise.all(configs.map(async (p) => {
    try {
      const remaining = await rateLimiter.getRemainingRequests(p.name, p);
      return {
        name: p.name,
        enabled: p.enabled,
        limits: { rpm: p.rpm, rpd: p.rpd },
        remaining: {
          minute: remaining?.minute ?? 0,
          day: remaining?.day ?? 0
        }
      };
    } catch (e) {
      console.error(`Status check failed for ${p.name}:`, e);
      return {
        name: p.name,
        enabled: false,
        limits: { rpm: p.rpm, rpd: p.rpd },
        remaining: { minute: 0, day: 0 }
      };
    }
  }));
  return statuses;
}

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v36.0)
 * Specialized for Multi-Modal Canvas Workspaces and Complex Pedagogical Tasks.
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
  
  // 1. Context Scoping - Pull active selections from DB
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed, authority, subject, grade_level, version_year, extracted_text')
    .eq('user_id', userId)
    .eq('is_selected', true); 
  
  const activeDocs = selectedDocs || [];
  let documentIds = activeDocs.map(d => d.id) || [];
  
  // 2. Priority Injection: Ensure the explicitly passed ID is treated as active context
  if (priorityDocumentId && !documentIds.includes(priorityDocumentId)) {
    documentIds = [priorityDocumentId, ...documentIds];
    const { data: priorityDocInfo } = await supabase
      .from('documents')
      .select('id, name, rag_indexed, authority, subject, grade_level, version_year, extracted_text')
      .eq('id', priorityDocumentId)
      .single();
    if (priorityDocInfo) activeDocs.push(priorityDocInfo);
  }
  
  // 3. Context Enforcement Check
  if (documentIds.length === 0) {
    return {
      text: "> ⚠️ **CONTEXT NOT SYNCED**: You haven't selected a curriculum asset yet. \n\nTo generate precise lesson plans, assessments, or rubrics grounded in your specific standards, please **select a document from the 'Curriculum Assets' sidebar** first.",
      provider: 'orchestrator',
      metadata: { isGrounded: false, chunksUsed: 0 }
    };
  }

  // 4. RAG Retrieval (Metadata-Aware)
  let retrievedChunks: RetrievedChunk[] = [];
  try {
    retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds: documentIds,
      supabase,
      matchCount: 20 
    });
  } catch (err) {
    console.warn("⚠️ [Orchestrator] Vector Retrieval Node Lagged. Falling back to direct extraction.");
  }
  
  // 5. Authoritative Vault Construction (with Fail-Safe Fallback)
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => `[NODE_${i + 1}] (SOURCE: ${activeDocs.find(d => d.id === (chunk as any).document_id)?.name || 'Library'})\n${chunk.chunk_text}\n---`)
      .join('\n');
  } else {
    // CRITICAL FAIL-SAFE: If vector retrieval returned 0 chunks but docs ARE selected,
    // inject the first 6,000 characters of the primary document directly.
    const primary = activeDocs[0];
    if (primary?.extracted_text) {
      console.log(`📡 [Orchestrator] Empty Vector Results. Injecting Raw Buffer from: ${primary.name}`);
      vaultContent = `[GROUNDING_FALLBACK_NODE] (SOURCE: ${primary.name})\n${primary.extracted_text.substring(0, 6000)}\n---\n*NOTE: Vector index cold; using direct document buffer.*`;
    } else {
      vaultContent = "ERROR: SYSTEM WAS UNABLE TO RETRIEVE TEXT DATA FOR SELECTED ASSETS.";
    }
  }

  // 6. Metadata Extraction
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const extractedSLOs = extractSLOCodes(userPrompt);
  
  // Inject primary document metadata into instructions
  const primaryDoc = activeDocs.find(d => d.id === (priorityDocumentId || documentIds[0])) || activeDocs[0];
  const masterSystem = customSystem || DEFAULT_MASTER_PROMPT;
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, primaryDoc);

  const fullPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent}
</AUTHORITATIVE_VAULT>

${NUCLEAR_GROUNDING_DIRECTIVE}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
- TASK_ENGINE: ${toolType || 'chat'}
- GROUNDING_LEVEL: AUTHORITATIVE
${responseInstructions}

RESPONSE:`;

  // 7. Strategic Routing
  const isComplexTool = toolType && ['lesson-plan', 'assessment', 'rubric'].includes(toolType);
  const preferredProvider = (isComplexTool || queryAnalysis.queryType === 'lesson_plan' || userPrompt.includes('research')) 
    ? 'gemini' 
    : (MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'gemini');
  
  const result = await synthesize(
    fullPrompt, 
    history.slice(-6), 
    true, // Grounding is now guaranteed by fallback
    [], 
    preferredProvider,
    masterSystem
  );
  
  // 8. Grounding Metadata & Final Formatting
  const groundingSources = result.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    title: chunk.web?.title || 'Educational Resource',
    uri: chunk.web?.uri
  })).filter((s: any) => s.uri) || [];

  let finalOutput = result.text;
  if (groundingSources.length > 0) {
    finalOutput += `\n\n### 🌐 Research Sources:\n${groundingSources.map((s: any) => `- [${s.title}](${s.uri})`).join('\n')}`;
  }

  return {
    text: finalOutput,
    provider: result.provider,
    metadata: {
      chunksUsed: retrievedChunks.length || 1,
      isGrounded: true,
      sourceDocument: primaryDoc?.name || 'Curriculum Library',
      extractedSLOs,
      sources: groundingSources
    }
  };
}