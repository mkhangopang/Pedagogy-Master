import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize, getProvidersConfig } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';
import { rateLimiter } from './rate-limiter';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v55.0)
 * Context Rules: Priority ID > Selected Vault > Global Discovery
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
  const isCurriculumEnabled = userPrompt.includes('CURRICULUM_MODE: ACTIVE');

  // 1. Scoping - Fetch selected docs OR priority ID
  let query = supabase
    .from('documents')
    .select('id, name, authority, subject, grade_level, version_year, rag_indexed, status')
    .eq('user_id', userId);

  if (priorityDocumentId) {
    query = query.eq('id', priorityDocumentId);
  } else {
    query = query.eq('is_selected', true);
  }

  const { data: activeDocs } = await query;
  const documentIds = activeDocs?.map(d => d.id) || [];
  
  let vaultContent = "";
  let verbatimFound = false;
  let mode: 'VAULT' | 'GLOBAL' = documentIds.length > 0 ? 'VAULT' : 'GLOBAL';
  let retrievedChunks: RetrievedChunk[] = [];

  // 2. Retrieval Branching
  if (mode === 'VAULT') {
    retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds,
      supabase,
      matchCount: 40
    });

    if (retrievedChunks.length > 0) {
      vaultContent = retrievedChunks
        .map((chunk, i) => {
          // Check for exact code match OR semantic alignment
          const isVerbatim = chunk.is_verbatim_definition || (targetCode && chunk.slo_codes?.includes(targetCode));
          const tag = isVerbatim ? " [!!! VERIFIED_VERBATIM_DEFINITION !!!]" : " [CONCEPTUAL_MATCH]";
          if (isVerbatim) verbatimFound = true;
          return `### VAULT_NODE_${i + 1}\n${tag}\n${chunk.chunk_text}\n---`;
        })
        .join('\n');
    } else {
      const processing = activeDocs?.filter(d => d.status !== 'ready') || [];
      if (processing.length > 0) {
        vaultContent = `[SYSTEM_ALERT: SELECTED_DOCS_STILL_SYNCING] The asset "${processing[0].name}" is not yet fully anchored in the vector grid. Synthesis fidelity will be reduced.`;
      } else {
        vaultContent = `[SEARCH_FAILURE: NO_RELEVANT_CONTEXT_FOUND] No relevant nodes found in ${activeDocs?.[0]?.name}. Falling back to general pedagogical reasoning based on provided SLO codes.`;
      }
    }
  }

  // 3. System Directives Construction
  let instructionSet = customSystem || DEFAULT_MASTER_PROMPT;
  
  let verificationLock = "";
  if (mode === 'VAULT' && targetCode && isCurriculumEnabled) {
    verificationLock = `
🔴 STICKY_GROUNDING_DIRECTIVE:
Targeting SLO Code: [${targetCode}].
1. If [VERIFIED_VERBATIM_DEFINITION] is present in vault content, use it EXACTLY.
2. If only [CONCEPTUAL_MATCH] is present, synthesize a high-fidelity answer based on those concepts.
3. If vault is empty or results are unrelated, proceed with synthesis using standard pedagogical principles but acknowledge the lack of specific vault text.
`;
  }

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDocs ? activeDocs[0] : undefined);

  let finalPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_INACTIVE: NO_DOCS_SELECTED]'}
</AUTHORITATIVE_VAULT>

${mode === 'VAULT' ? NUCLEAR_GROUNDING_DIRECTIVE : ''}
${verificationLock}

## USER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
${responseInstructions}`;

  const result = await synthesize(
    finalPrompt, 
    history.slice(-4), 
    mode === 'VAULT', 
    [], 
    'gemini', 
    instructionSet
  );
  
  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      chunksUsed: retrievedChunks?.length || 0,
      verbatimVerified: verbatimFound,
      activeMode: mode,
      sourceDocument: activeDocs?.[0]?.name || 'Global Grid'
    }
  } as any;
}