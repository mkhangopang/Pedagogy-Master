import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v78.0)
 * Feature: Last-Resort Lexical Verification for Sindh Standards.
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

  // 2. MULTI-TIER RETRIEVAL
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
        // VERIFICATION UPGRADE: Check slo_codes array AND raw text for literal match
        // This handles cases where the indexer might have missed the tag but the retriever found the chunk.
        const literalInText = primarySLO && chunk.chunk_text.toUpperCase().includes(primarySLO.toUpperCase());
        const isVerbatim = chunk.is_verbatim_definition || (primarySLO && chunk.slo_codes?.includes(primarySLO)) || literalInText;
        
        if (isVerbatim) verbatimFound = true;
        
        return `### VAULT_NODE_${i + 1}${isVerbatim ? " [!!! AUTHORITATIVE_STANDARD !!!]" : ""}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  }

  // 3. Header Protocol
  const primaryHeaderRule = primarySLO 
    ? `## TARGET SLO: ${primarySLO} - ${verbatimFound ? '[USE VERBATIM DESCRIPTION FROM VAULT]' : '[DESCRIPTION MISSING FROM VAULT]'}` 
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
${vaultContent || '[VAULT_INACTIVE: No matching content found in current curriculum context]'}
</AUTHORITATIVE_VAULT>

${mode === 'VAULT' ? NUCLEAR_GROUNDING_DIRECTIVE : ''}

## MISSION:
Synthesize a world-class pedagogical artifact. 

## PRIMARY_HEADER_PROTOCOL:
${primaryHeaderRule}

## ALIGNMENT RULES:
1. If the Primary SLO description is missing from the vault, explicitly state "DESCRIPTION MISSING FROM VAULT" in the header and proceed with a general approach that aligns with the SLO code prefix (e.g., Grade Level 10 assumed from ${primarySLO}).
2. If available, use the verbatim standard description from the nodes marked [!!! AUTHORITATIVE_STANDARD !!!].
3. Cross-reference all activities with Bloom's Taxonomy.
4. Adapt tone based on the ADAPTIVITY_MEMO.

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
      dnaMatched: !!activeDoc
    }
  } as any;
}