import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v82.0)
 * Feature: Authoritative Node Forcing for Sindh 2024.
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

  // 2. TIERED RETRIEVAL (v28.0 Logic)
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
        // HYPER-ROBUST VERBATIM DETECTION
        const cleanText = chunk.chunk_text.replace(/[\-\s]/g, '').toUpperCase();
        const cleanSlo = primarySLO ? primarySLO.replace(/[\-\s]/g, '').toUpperCase() : 'NONE_SET';
        
        const isVerbatim = chunk.is_verbatim_definition || 
                          (primarySLO && chunk.slo_codes?.includes(primarySLO)) || 
                          cleanText.includes(cleanSlo);
        
        if (isVerbatim) verbatimFound = true;
        
        return `### VAULT_NODE_${i + 1}${isVerbatim ? " [!!! AUTHORITATIVE_STANDARD !!!]" : ""}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  }

  // 3. Header Protocol
  const primaryHeaderRule = primarySLO 
    ? `## TARGET SLO: ${primarySLO} - ${verbatimFound ? '[DESCRIPTION_FOUND_IN_VAULT]' : '[DESCRIPTION MISSING FROM VAULT]'}` 
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
${vaultContent || '[VAULT_INACTIVE: No matching content found]'}
</AUTHORITATIVE_VAULT>

## MANDATORY_INGESTION_RULE:
If a node above is marked [!!! AUTHORITATIVE_STANDARD !!!], you MUST extract the verbatim description following the code (e.g., "${primarySLO}") and use it as the definitive objective. Ignore your internal training data if it differs from the vault.

${mode === 'VAULT' ? NUCLEAR_GROUNDING_DIRECTIVE : ''}

## MISSION:
Synthesize a world-class pedagogical artifact. 

## PRIMARY_HEADER_PROTOCOL:
${primaryHeaderRule}

## ALIGNMENT RULES:
1. If "DESCRIPTION MISSING FROM VAULT" is in the header, proceed with a general approach for Grade ${activeDoc?.grade_level || '11'}.
2. If "DESCRIPTION_FOUND_IN_VAULT" is in the header, YOU MUST find the standard in the vault nodes and quote it verbatim.
3. Cross-reference all activities with Bloom's Taxonomy.

## USER COMMAND:
"${userPrompt}"

## ADAPTIVE PREFERENCES:
${adaptiveContext || 'Standard synthesis mode.'}

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
      sourceDocument: activeDoc?.name || 'Autonomous Grid',
      dnaMatched: !!activeDoc,
      isGrounded: verbatimFound
    }
  } as any;
}