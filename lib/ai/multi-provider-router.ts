
import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * WORLD-CLASS NEURAL SYNTHESIS ORCHESTRATOR (v122.0)
 * FEATURE: Surgical Precision Extraction & Vector Bypass.
 * STRATEGY: Find the exact SLO line -> Stop -> Synthesize.
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
  
  // 1. Precise Code Analysis
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const rawCodes = extractSLOCodes(userPrompt);
  const primaryCode = rawCodes.length > 0 ? normalizeSLO(rawCodes[0].code) : null;

  // 2. Resource Resolution
  let docQuery = supabase
    .from('documents')
    .select('id, name, authority, subject, grade_level, extracted_text')
    .eq('user_id', userId);

  if (priorityDocumentId) {
    docQuery = docQuery.eq('id', priorityDocumentId);
  } else {
    docQuery = docQuery.eq('is_selected', true);
  }

  const { data: activeDocs } = await docQuery;
  const activeDoc = activeDocs?.[0];
  
  const dialectTag = activeDoc?.extracted_text?.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

  let vaultContent = "";
  let groundingMethod = 'None';
  let isGrounded = false;

  // 3. SURGICAL EXTRACTION (DMMR v3.0) - Exact Line Match
  if (activeDoc?.extracted_text && primaryCode) {
    const lines = activeDoc.extracted_text.split('\n');
    let targetIndex = -1;
    
    // Find the exact line containing the SLO code
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toUpperCase().includes(primaryCode)) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex !== -1) {
      // Trace hierarchy backwards to get context headers without the bulk
      let domain = "General";
      let standard = "Standard";
      let benchmark = "Benchmark";
      
      for (let j = targetIndex; j >= 0; j--) {
        const line = lines[j].trim();
        if (line.startsWith('# GRADE')) continue;
        if (line.startsWith('# DOMAIN')) domain = line;
        else if (line.startsWith('## DOMAIN')) domain = line;
        else if (line.startsWith('**Standard:**')) standard = line;
        else if (line.startsWith('### BENCHMARK')) benchmark = line;
        
        // Stop tracing once we have the immediate structure
        if (domain !== "General" && standard !== "Standard") break;
      }

      vaultContent = `
### SURGICAL_PRECISION_VAULT_EXTRACT [HIGH FIDELITY]
${domain}
${standard}
${benchmark}
- ${lines[targetIndex]}
`;
      isGrounded = true;
      groundingMethod = 'Master MD Surgical Line-Match';
    }
  }

  // 4. VECTOR AUGMENTATION (Conditional Bypass)
  // If we found the exact SLO line, we skip the heavy vector search to save tokens.
  if (!isGrounded && activeDoc) {
    const retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds: [activeDoc.id],
      supabase,
      matchCount: 6 // Small count for concept-only queries
    });

    if (retrievedChunks.length > 0) {
      vaultContent = retrievedChunks
        .map((chunk, i) => `### CONCEPTUAL_NODE_${i+1}\n${chunk.chunk_text}\n---`)
        .join('\n');
      isGrounded = true;
      groundingMethod = 'Semantic Vector Fallback';
    }
  }

  // 5. Synthesis Execution
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDoc);
  const systemInstruction = customSystem || DEFAULT_MASTER_PROMPT;

  // We set thinkingBudget based on task complexity to avoid model timeout
  const complexityLevel = isGrounded && primaryCode ? 'low' : 'medium';

  const finalPrompt = `
<PEDAGOGICAL_CONTEXT>
DIALECT: ${dialectTag}
AUTHORITY: ${activeDoc?.authority || 'Independent'}
${adaptiveContext || ''}
</PEDAGOGICAL_CONTEXT>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: Use standard pedagogical knowledge]'}
</AUTHORITATIVE_VAULT>

## MISSION:
Produce pedagogical artifacts strictly following the AUTHORITATIVE_VAULT.

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
      groundingMethod
    }
  };
}
