import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * WORLD-CLASS NEURAL SYNTHESIS ORCHESTRATOR (v124.0)
 * FEATURE: High-Precision SLO Grounding & Resilient Retrieval.
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
  
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const detectedCodes = extractSLOCodes(userPrompt);
  
  // Normalize codes for strict lookup (ensures B-09-A-01 matches B09A01)
  const normalizedPrimaryCode = detectedCodes.length > 0 ? normalizeSLO(detectedCodes[0].code) : null;

  let docQuery = supabase
    .from('documents')
    .select('id, name, authority, subject, grade_level, extracted_text, master_md_dialect')
    .eq('user_id', userId);

  if (priorityDocumentId) {
    docQuery = docQuery.eq('id', priorityDocumentId);
  } else {
    docQuery = docQuery.eq('is_selected', true);
  }

  const { data: activeDocs } = await docQuery;
  const activeDoc = activeDocs?.[0];
  const dialectTag = activeDoc?.master_md_dialect || 'Standard';

  let vaultContent = "";
  let groundingMethod = 'None';
  let isGrounded = false;

  // 1. SURGICAL EXTRACTION (Priority Level 1)
  if (activeDoc?.extracted_text && normalizedPrimaryCode) {
    const lines = activeDoc.extracted_text.split('\n');
    let targetIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (normalizeSLO(lines[i]).includes(normalizedPrimaryCode)) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex !== -1) {
      vaultContent = `### SURGICAL_PRECISION_VAULT_EXTRACT\n- VERIFIED_SLO_MATCH: ${lines[targetIndex]}\n`;
      isGrounded = true;
      groundingMethod = 'Surgical Line-Match';
    }
  }

  // 2. VECTOR AUGMENTATION (Priority Level 2 - Fallback)
  if (!isGrounded && activeDoc) {
    const retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds: [activeDoc.id],
      supabase,
      matchCount: 8,
      dialect: dialectTag
    });

    if (retrievedChunks.length > 0) {
      vaultContent = retrievedChunks
        .map((chunk, i) => `### ASSET_NODE_${i+1}\n${chunk.chunk_text}\n---`)
        .join('\n');
      isGrounded = true;
      groundingMethod = 'Vector Semantic Search';
    }
  }

  const systemInstruction = customSystem || DEFAULT_MASTER_PROMPT;
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDoc);

  const finalPrompt = `
<CONTEXT_SIGNATURE>
DIALECT: ${dialectTag}
GROUNDING_METHOD: ${groundingMethod}
IDENTIFIED_SLO: ${normalizedPrimaryCode || 'None'}
${adaptiveContext || ''}
</CONTEXT_SIGNATURE>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: No curriculum context found for this specific query]'}
</AUTHORITATIVE_VAULT>

## COMMAND:
"${userPrompt}"

## EXECUTION_SPEC:
${responseInstructions}`;

  const result = await synthesize(finalPrompt, history.slice(-4), isGrounded, [], 'gemini', systemInstruction);
  
  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      isGrounded,
      dialect: dialectTag,
      sourceDocument: activeDoc?.name || 'Global Node',
      groundingMethod,
      diagnostic: {
        slo_normalized: normalizedPrimaryCode,
        chunks_retrieved: vaultContent ? 'Success' : 'Empty'
      }
    }
  };
}
