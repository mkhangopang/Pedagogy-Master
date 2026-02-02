import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v60.0)
 * Context Rules: Relational Code Scan > Selected Vault > Relational DB > Profile Fallback
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

  // 1. Scoping
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

  // 2. RELATIONAL PRE-SCAN: If code is present, try literal DB match first
  if (mode === 'VAULT' && targetCode) {
    const { data: relationalMatch } = await supabase
      .from('document_chunks')
      .select('*')
      .in('document_id', documentIds)
      .contains('slo_codes', [targetCode])
      .limit(3);
    
    if (relationalMatch && relationalMatch.length > 0) {
      console.log(`✅ [Relational Match] Found literal tag for ${targetCode}`);
      retrievedChunks = relationalMatch.map(m => ({
        chunk_id: m.id,
        document_id: m.document_id,
        chunk_text: m.chunk_text,
        slo_codes: m.slo_codes,
        metadata: m.metadata,
        combined_score: 10.0,
        is_verbatim_definition: true
      }));
    }
  }

  // 3. HYBRID FALLBACK: If relational scan missed, use vector/FTS
  if (mode === 'VAULT' && retrievedChunks.length === 0) {
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
        const tag = isVerbatim ? " [!!! VERIFIED_VERBATIM_DEFINITION !!!]" : " [SEMANTIC_MATCH]";
        if (isVerbatim) verbatimFound = true;
        
        return `### VAULT_NODE_${i + 1}\n${tag}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  } else if (mode === 'VAULT') {
    vaultContent = `[SYSTEM_ALERT: NO_CONTEXT_MATCHES]
Scanned vault for "${targetCode || userPrompt}". Zero high-confidence fragments returned. 
Proceed with pedagogical intelligence for Grade ${activeDocs?.[0]?.grade_level || 'General'}.`;
  }

  // 4. Prompt Assembly
  let instructionSet = customSystem || DEFAULT_MASTER_PROMPT;
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDocs ? activeDocs[0] : undefined);

  let finalPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_INACTIVE]'}
</AUTHORITATIVE_VAULT>

${mode === 'VAULT' ? NUCLEAR_GROUNDING_DIRECTIVE : ''}

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
      sourceDocument: activeDocs?.[0]?.name || 'Global Grid'
    }
  } as any;
}