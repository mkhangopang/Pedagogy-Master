import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize, getProvidersConfig } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';
import { rateLimiter } from './rate-limiter';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v53.0)
 * Context Rules: Verified Vault > Global Discovery Mode
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

  // 1. Scoping - Check for active document selection
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name')
    .eq('user_id', userId)
    .eq('is_selected', true); 
  
  const activeDocs = selectedDocs || [];
  const documentIds = activeDocs.map(d => d.id);

  // 2. Retrieval Branching
  let vaultContent = "";
  let verbatimFound = false;
  let mode: 'VAULT' | 'GLOBAL' = activeDocs.length > 0 ? 'VAULT' : 'GLOBAL';

  if (mode === 'VAULT') {
    const retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds,
      supabase,
      matchCount: 40
    });

    vaultContent = retrievedChunks
      .map((chunk, i) => {
        const tag = chunk.is_verbatim_definition ? " [!!! VERIFIED_VERBATIM_DEFINITION !!!]" : "";
        if (chunk.is_verbatim_definition) verbatimFound = true;
        return `### VAULT_NODE_${i + 1}\n${tag}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  }

  // 3. System Directives Construction
  let instructionSet = customSystem || DEFAULT_MASTER_PROMPT;
  
  if (mode === 'GLOBAL') {
    instructionSet += `
## 🌐 GLOBAL DISCOVERY MODE:
- No curriculum document is currently selected in the teacher's vault.
- ACTION: You MUST first ask the teacher which curriculum/board they follow (e.g., Sindh Board Pakistan, KSA Vision 2030, Japan MEXT, or Cambridge).
- SUGGESTION: Offer to search for specific Sindh SLOs if they are in the Sindh region.
- Do not generate complex artifacts until the Board is confirmed.
`;
  }

  let verificationLock = "";
  if (mode === 'VAULT' && targetCode && isCurriculumEnabled) {
    verificationLock = `
🔴 STICKY_VERBATIM_LOCK:
Targeting SLO: [${targetCode}].
1. Locate [VERIFIED_VERBATIM_DEFINITION] in vault.
2. Use that exact text.
3. If missing, say: "SLO ${targetCode} not found in active vault." DO NOT MIMIC.
`;
  }

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDocs[0]);

  let finalPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent || (mode === 'GLOBAL' ? '[VAULT_INACTIVE: NO_DOCS_SELECTED]' : '[SEARCH_FAILURE: NO_CONTEXT_FOUND]')}
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
      chunksUsed: mode === 'VAULT' ? 10 : 0,
      verbatimVerified: verbatimFound,
      activeMode: mode,
      sourceDocument: activeDocs[0]?.name || 'Global Grid'
    }
  };
}

export async function getProviderStatus() {
  const configs = getProvidersConfig();
  const status = await Promise.all(configs.map(async (config) => {
    const remaining = await rateLimiter.getRemainingRequests(config.name, config);
    return {
      name: config.name,
      enabled: config.enabled,
      limits: { rpm: config.rpm, rpd: config.rpd },
      remaining
    };
  }));
  return status;
}
