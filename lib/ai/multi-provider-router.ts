import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v85.0)
 * Signature: Precision-First Grounding for Sindh 2024.
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
  
  const extractedSLOs = extractSLOCodes(userPrompt);
  const primarySLO = extractedSLOs.length > 0 ? extractedSLOs[0] : null;

  // 1. Identity Resolution
  let docQuery = supabase
    .from('documents')
    .select('id, name, authority, subject, grade_level, version_year, document_summary')
    .eq('user_id', userId);

  if (priorityDocumentId) {
    docQuery = docQuery.eq('id', priorityDocumentId);
  } else {
    docQuery = docQuery.eq('is_selected', true);
  }

  const { data: activeDocs } = await docQuery;
  const activeDoc = activeDocs?.[0];
  const documentIds = activeDocs?.map(d => d.id) || [];
  
  const dnaMemo = activeDoc ? `
### CURRICULUM_DNA_ACTIVE
- IDENTITY: ${activeDoc.authority || 'Independent'} Node
- FOCUS: ${activeDoc.subject} (Grade ${activeDoc.grade_level})
- TERMINOLOGY: Use ${activeDoc.authority?.toLowerCase().includes('sindh') ? 'SLOs and Progression Grids' : 'Learning Outcomes'}.
` : '[GLOBAL_AUTONOMOUS_MODE]';

  let vaultContent = "";
  let verbatimFound = false;
  let mode: 'VAULT' | 'GLOBAL' = documentIds.length > 0 ? 'VAULT' : 'GLOBAL';
  let retrievedChunks: RetrievedChunk[] = [];

  // 2. Precision Retrieval (v30.0)
  if (mode === 'VAULT') {
    retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds,
      supabase,
      matchCount: 40
    });
  }

  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => {
        // Robust Verbatim Cross-Check
        const cleanText = chunk.chunk_text.replace(/[\-\s]/g, '').toUpperCase();
        const cleanSlo = primarySLO ? primarySLO.replace(/[\-\s]/g, '').toUpperCase() : '___';
        
        const isVerbatim = chunk.is_verbatim_definition || 
                          (primarySLO && chunk.slo_codes?.includes(primarySLO)) || 
                          cleanText.includes(cleanSlo);
        
        if (isVerbatim) verbatimFound = true;
        
        return `### VAULT_NODE_${i + 1}${isVerbatim ? " [!!! VERBATIM_CURRICULUM_STANDARD !!!]" : ""}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  }

  // 3. Header Protocol
  const primaryHeaderRule = primarySLO 
    ? `## TARGET SLO: ${primarySLO} - ${verbatimFound ? '[DESCRIPTION_FOUND_IN_VAULT]' : '[DESCRIPTION_MISSING_SEARCHING_TEXT]'}` 
    : '';

  // 4. Synthesis Orchestration
  let instructionSet = customSystem || DEFAULT_MASTER_PROMPT;
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDoc);

  let finalPrompt = `
<CURRICULUM_ADAPTIVITY_MEMO>
${dnaMemo}
</CURRICULUM_ADAPTIVITY_MEMO>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: Context link failure]'}
</AUTHORITATIVE_VAULT>

## MISSION:
Synthesize a world-class pedagogical artifact using strictly grounded curriculum data.

## GROUNDING_PROTOCOL:
1. If a node is marked [!!! VERBATIM_CURRICULUM_STANDARD !!!], you MUST use that text as the source of truth for the objective description.
2. If "DESCRIPTION_MISSING" is in the header, search all vault nodes for the string "${primarySLO}". It may be inside the text but not metadata-tagged. 
3. If no literal match exists after deep-scanning the vault, proceed with Grade-aligned general knowledge but ADD A WARNING at the top.

## USER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
${responseInstructions}`;

  const isComplex = queryAnalysis.queryType === 'lesson_plan' || queryAnalysis.expectedResponseLength === 'long';
  const preferredModel = isComplex ? 'gemini' : 'groq';

  const result = await synthesize(finalPrompt, history.slice(-6), mode === 'VAULT', [], preferredModel, instructionSet);
  
  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      chunksUsed: retrievedChunks?.length || 0,
      verbatimVerified: verbatimFound,
      activeMode: mode,
      sourceDocument: activeDoc?.name || 'Autonomous Node',
      isGrounded: verbatimFound
    }
  } as any;
}