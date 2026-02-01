import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize, getProvidersConfig } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';
import { rateLimiter } from './rate-limiter';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v56.0)
 * Context Rules: Priority ID > Selected Vault > Relational DB > Global
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
          const isVerbatim = chunk.is_verbatim_definition || (targetCode && chunk.slo_codes?.includes(targetCode));
          const tag = isVerbatim ? " [!!! VERIFIED_VERBATIM_DEFINITION !!!]" : " [CONCEPTUAL_MATCH]";
          if (isVerbatim) verbatimFound = true;
          
          return `### VAULT_NODE_${i + 1}\n${tag}\n${chunk.chunk_text}\n---`;
        })
        .join('\n');
    } else {
      // If no chunks, try relational DB lookup as last line of defense
      if (targetCode) {
        const { data: sloDb } = await supabase
          .from('slo_database')
          .select('slo_full_text')
          .eq('slo_code', targetCode)
          .in('document_id', documentIds)
          .maybeSingle();
        
        if (sloDb) {
          vaultContent = `### RELATIONAL_SLO_NODE\n[VERIFIED_FROM_METADATA_INDEX]\n${targetCode}: ${sloDb.slo_full_text}\n---`;
          verbatimFound = true;
        }
      }

      if (!vaultContent) {
        vaultContent = `[SEARCH_FAILURE: NO_RELEVANT_CONTEXT_FOUND] The query did not yield specific segments in the active vault. Proceeding with synthesized pedagogical intelligence using the provided SLO standard: ${targetCode || 'General'}.`;
      }
    }
  }

  // 3. System Directives Construction
  let instructionSet = customSystem || DEFAULT_MASTER_PROMPT;
  
  let verificationLock = "";
  if (mode === 'VAULT' && targetCode && isCurriculumEnabled) {
    verificationLock = `
🔴 STICKY_GROUNDING_DIRECTIVE:
Targeting SLO: [${targetCode}].
1. If [VERIFIED_VERBATIM_DEFINITION] is present, use that text EXACTLY.
2. If only [CONCEPTUAL_MATCH] is present, prioritize those concepts but synthesize the missing gaps using Grade ${activeDocs?.[0]?.grade_level || 'standard'} complexity.
3. If [SEARCH_FAILURE] is reported, synthesize a high-fidelity artifact using your internal knowledge of standard curricula, but acknowledge the vault search failure.
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