import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * WORLD-CLASS NEURAL SYNTHESIS ORCHESTRATOR (v123.0)
 * FEATURE: Surgical Precision Extraction & Vector Bypass.
 * STRATEGY: Master MD Surgical Line-Match -> Dialect-Aware Semantic Fallback.
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
  
  // 1. Specialized Code Analysis
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const rawCodes = extractSLOCodes(userPrompt);
  const primaryCode = rawCodes.length > 0 ? normalizeSLO(rawCodes[0].code) : null;

  // 2. Resource Resolution
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

  // 3. SURGICAL EXTRACTION (DMMR v4.0) - Master MD Line Match
  if (activeDoc?.extracted_text && primaryCode) {
    const lines = activeDoc.extracted_text.split('\n');
    let targetIndex = -1;
    
    // Direct lookup for normalized SLO code
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toUpperCase().includes(primaryCode)) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex !== -1) {
      // Trace hierarchy backwards for context preservation (Protocol 3)
      let grade = "N/A";
      let domain = "N/A";
      let standard = "Standard";
      let benchmark = "Benchmark";
      
      for (let j = targetIndex; j >= 0; j--) {
        const l = lines[j].trim();
        if (l.startsWith('# GRADE')) grade = l;
        else if (l.startsWith('## DOMAIN')) domain = l;
        else if (l.startsWith('**Standard:**')) standard = l;
        else if (l.startsWith('**Benchmark')) benchmark = l;
        
        if (grade !== "N/A" && domain !== "N/A") break;
      }

      vaultContent = `
### MASTER_MD_SURGICAL_ALIGNMENT [Verified Ingestion]
${grade}
${domain}
${standard}
${benchmark}
- ${lines[targetIndex]}
`;
      isGrounded = true;
      groundingMethod = 'Master MD Surgical Line-Match';
    }
  }

  // 4. DIALECT-AWARE VECTOR AUGMENTATION (Semantic Fallback)
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
      groundingMethod = 'Semantic Vector Fallback';
    }
  }

  // 5. Artifact Synthesis
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDoc);
  const systemInstruction = customSystem || DEFAULT_MASTER_PROMPT;

  const finalPrompt = `
<CONTEXT_SIGNATURE>
DIALECT: ${dialectTag}
GROUNDING_LEVEL: ${groundingMethod}
${adaptiveContext || ''}
</CONTEXT_SIGNATURE>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: No curriculum context selected]'}
</AUTHORITATIVE_VAULT>

## COMMAND:
"${userPrompt}"

## EXECUTION_SPEC:
${responseInstructions}`;

  const result = await synthesize(finalPrompt, history.slice(-4), isGrounded, [], 'gemini', systemInstruction);
  
  // Log grounding method to DB column (SQL v118 evolution)
  if (isGrounded && activeDoc) {
    supabase.from('documents').update({ last_grounding_method: groundingMethod }).eq('id', activeDoc.id).then();
  }

  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      isGrounded,
      dialect: dialectTag,
      sourceDocument: activeDoc?.name || 'Global Node',
      groundingMethod
    }
  };
}
