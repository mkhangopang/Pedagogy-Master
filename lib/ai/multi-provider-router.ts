
import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize, getProvidersConfig } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';
import { rateLimiter } from './rate-limiter';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v54.0)
 * Context Rules: Verified Vault > Conceptual Fallback > Global Discovery
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

  // 1. Scoping - Fetch selected docs with high-fidelity validation
  const { data: activeDocs } = await supabase
    .from('documents')
    .select('id, name, authority, subject, grade_level, version_year, rag_indexed')
    .eq('user_id', userId)
    .eq('is_selected', true); 

  const documentIds = activeDocs?.map(d => d.id) || [];
  let vaultContent = "";
  let verbatimFound = false;
  let mode: 'VAULT' | 'GLOBAL' = documentIds.length > 0 ? 'VAULT' : 'GLOBAL';
  // Add comment above each fix
  // Fix: Move retrievedChunks declaration outside of if-block to resolve scope error at line 121
  let retrievedChunks: RetrievedChunk[] = [];

  // 2. Retrieval Branching
  if (mode === 'VAULT') {
    // Fix: Remove 'const' keyword to assign to the outer scoped variable
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
      // If doc is selected but no chunks found, it might be unindexed
      const unindexed = activeDocs?.filter(d => !d.rag_indexed) || [];
      if (unindexed.length > 0) {
        vaultContent = `[SYSTEM_ALERT: SELECTED_DOCS_UNINDEXED] The assets "${unindexed.map(d => d.name).join(', ')}" are still being processed. Synthesis will proceed with limited fidelity.`;
      }
    }
  }

  // 3. System Directives Construction
  let instructionSet = customSystem || DEFAULT_MASTER_PROMPT;
  
  if (mode === 'GLOBAL') {
    instructionSet += `
## 🌐 GLOBAL DISCOVERY MODE:
- No curriculum document is currently selected.
- ACTION: Prompt the teacher to select a curriculum asset from their Vault.
`;
  }

  let verificationLock = "";
  if (mode === 'VAULT' && targetCode && isCurriculumEnabled) {
    verificationLock = `
🔴 STICKY_VERBATIM_LOCK:
Targeting SLO: [${targetCode}].
1. Priority: Use [VERIFIED_VERBATIM_DEFINITION].
2. Fallback: If no verbatim marker exists but [CONCEPTUAL_MATCH] is present, synthesize an answer based on the concepts.
3. Only if ZERO context is found, say: "SLO ${targetCode} not found in active vault."
`;
  }

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDocs ? activeDocs[0] : undefined);

  let finalPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent || (mode === 'GLOBAL' ? '[VAULT_INACTIVE: NO_DOCS_SELECTED]' : '[SEARCH_FAILURE: NO_RELEVANT_CONTEXT_FOUND]')}
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
