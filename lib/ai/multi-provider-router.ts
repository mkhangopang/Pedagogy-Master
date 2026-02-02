import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v72.0)
 * Features: Recursive Contextualization & DNA Mapping.
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
  const targetCode = extractedSLOs.length > 0 ? extractedSLOs[0] : null;

  // 1. Adaptive Scope Detection
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
  
  // 2. CURRICULUM DNA MAPPING (Recursive Contextualization)
  const dnaMemo = activeDoc ? `
### CURRICULUM_DNA_ACTIVE
- IDENTITY: ${activeDoc.authority || 'Independent'} Node
- FOCUS: ${activeDoc.subject} (Grade ${activeDoc.grade_level})
- ARCHITECTURE_SUMMARY: ${activeDoc.document_summary || 'Standardized curriculum framework.'}
- TERMINOLOGY_ADAPTATION: Use ${activeDoc.authority?.toLowerCase().includes('sindh') ? 'SLOs and Progression Grids' : 'Learning Outcomes and Benchmarks'}.
` : '[GLOBAL_AUTONOMOUS_MODE: No active vault anchoring]';

  let vaultContent = "";
  let verbatimFound = false;
  let mode: 'VAULT' | 'GLOBAL' = documentIds.length > 0 ? 'VAULT' : 'GLOBAL';
  let retrievedChunks: RetrievedChunk[] = [];

  // 3. MULTI-TIER RETRIEVAL (v25 Logic)
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
        const isVerbatim = chunk.is_verbatim_definition || (targetCode && chunk.slo_codes?.includes(targetCode));
        const status = isVerbatim ? " [!!! AUTHORITATIVE_STANDARD !!!]" : " [PEDAGOGICAL_CONTEXT]";
        if (isVerbatim) verbatimFound = true;
        
        return `### VAULT_NODE_${i + 1}${status}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  }

  // 4. Synthesis Orchestration
  let instructionSet = customSystem || DEFAULT_MASTER_PROMPT;
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDoc);

  // 5. WORLD-CLASS PROMPT CONSTRUCTION
  let finalPrompt = `
<CURRICULUM_ADAPTIVITY_MEMO>
${dnaMemo}
</CURRICULUM_ADAPTIVITY_MEMO>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_INACTIVE: Proceed using general pedagogical expertise]'}
</AUTHORITATIVE_VAULT>

${mode === 'VAULT' ? NUCLEAR_GROUNDING_DIRECTIVE : ''}

## MISSION:
Synthesize a world-class pedagogical artifact following the "Teacher's Digital Twin" protocol. 

## ALIGNMENT RULES:
1. If an [AUTHORITATIVE_STANDARD] is in the vault, you MUST use its verbatim description.
2. Cross-reference all activities with Bloom's Taxonomy cognitive demand.
3. If creating a lesson plan, prioritize active learning and scaffolding for Grade ${activeDoc?.grade_level || 'K-12'}.
4. Adapt tone based on the ADAPTIVITY_MEMO above.

## USER COMMAND:
"${userPrompt}"

## ADAPTIVE PREFERENCES:
${adaptiveContext || 'Standard synthesis mode.'}

## EXECUTION PARAMETERS:
${responseInstructions}`;

  // Smart Routing: Pro for complex, Flash for simple
  const isComplex = queryAnalysis.expectedResponseLength === 'long' || queryAnalysis.queryType === 'lesson_plan';
  const preferredModel = isComplex ? 'gemini' : 'gemini-flash';

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