import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v65.0)
 * Designed for World-Class Pedagogical Fidelity.
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

  // 1. Context Scoping
  let docQuery = supabase
    .from('documents')
    .select('id, name, authority, subject, grade_level, version_year')
    .eq('user_id', userId);

  if (priorityDocumentId) {
    docQuery = docQuery.eq('id', priorityDocumentId);
  } else {
    docQuery = docQuery.eq('is_selected', true);
  }

  const { data: activeDocs } = await docQuery;
  const documentIds = activeDocs?.map(d => d.id) || [];
  
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
        const isVerbatim = chunk.is_verbatim_definition || (targetCode && chunk.slo_codes?.includes(targetCode));
        const status = isVerbatim ? " [!!! AUTHORITATIVE_STANDARD !!!]" : " [PEDAGOGICAL_CONTEXT]";
        if (isVerbatim) verbatimFound = true;
        
        return `### VAULT_NODE_${i + 1}${status}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  } else if (mode === 'VAULT') {
    vaultContent = `[SYSTEM_WARNING: ZERO_RELEVANT_CONTEXT_IN_VAULT]
No high-confidence matches found for identifiers or topics. Proceed using general pedagogical frameworks (5E/Bloom) but flag the missing alignment to the user.`;
  }

  // 3. Synthesis Parameters
  let instructionSet = customSystem || DEFAULT_MASTER_PROMPT;
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDocs ? activeDocs[0] : undefined);

  // 4. World-Class Synthesis Prompt
  let finalPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_INACTIVE]'}
</AUTHORITATIVE_VAULT>

${mode === 'VAULT' ? NUCLEAR_GROUNDING_DIRECTIVE : ''}

## MISSION:
Synthesize a world-class pedagogical artifact. 

## ALIGNMENT RULES:
1. If an [AUTHORITATIVE_STANDARD] is in the vault, you MUST use its verbatim description.
2. Cross-reference activities with Bloom's Taxonomy.
3. If creating a lesson plan, provide specific teacher scripts for the "Explain" phase.
4. Omit all conversational filler (e.g., "Sure, I can help with that").

## USER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
${responseInstructions}`;

  const result = await synthesize(finalPrompt, history.slice(-4), mode === 'VAULT', [], 'gemini', instructionSet);
  
  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      chunksUsed: retrievedChunks?.length || 0,
      verbatimVerified: verbatimFound,
      activeMode: mode,
      sourceDocument: activeDocs?.[0]?.name || 'Autonomous Grid'
    }
  } as any;
}