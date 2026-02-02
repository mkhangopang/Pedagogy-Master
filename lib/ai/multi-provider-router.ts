import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize, getProvidersConfig } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';
import { rateLimiter } from './rate-limiter';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v58.0)
 * Context Rules: Priority ID > Selected Vault > Relational DB > Profile Fallback
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
  let docQuery = supabase
    .from('documents')
    .select('id, name, authority, subject, grade_level, version_year, rag_indexed, status')
    .eq('user_id', userId);

  if (priorityDocumentId) {
    docQuery = docQuery.eq('id', priorityDocumentId);
  } else {
    docQuery = docQuery.eq('is_selected', true);
  }

  let { data: activeDocs } = await docQuery;
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
          const tag = isVerbatim ? " [!!! VERIFIED_VERBATIM_DEFINITION !!!]" : " [SEMANTIC_MATCH]";
          if (isVerbatim) verbatimFound = true;
          
          return `### VAULT_NODE_${i + 1}\n${tag}\n${chunk.chunk_text}\n---`;
        })
        .join('\n');
    } else {
      vaultContent = `[SYSTEM_ALERT: NO_CONTEXT_MATCHES]
The active vault "${activeDocs?.[0]?.name || 'Unknown'}" was scanned using Hybrid Search v4, but no specific matches for "${targetCode || userPrompt}" were found.
DIAGNOSTIC:
- Vector Dimension: 768
- Search Method: Hybrid (Lexical + Semantic)
- Document ID: ${documentIds[0]}
- Target SLO: ${targetCode || 'None Identified'}

INSTRUCTION: Proceed with high-fidelity synthesis using standard Grade ${activeDocs?.[0]?.grade_level || 'HSSC'} pedagogical intelligence, but note the lack of specific vault text for this objective.`;
    }
  }

  // 3. System Directives Construction
  let instructionSet = customSystem || DEFAULT_MASTER_PROMPT;
  
  let verificationLock = "";
  if (mode === 'VAULT' && targetCode && isCurriculumEnabled) {
    verificationLock = `
🔴 STICKY_GROUNDING_DIRECTIVE:
Targeting SLO: [${targetCode}].
1. If [VERIFIED_VERBATIM_DEFINITION] is present, use it verbatim.
2. If only [SEMANTIC_MATCH] is present, use it as the conceptual foundation.
3. If [NO_CONTEXT_MATCHES] is reported, act as a high-fidelity instructional designer using your internal knowledge of the "${activeDocs?.[0]?.authority || 'Pakistan'}" curriculum standards.
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