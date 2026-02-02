import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * WORLD-CLASS NEURAL SYNTHESIS ORCHESTRATOR (v120.0)
 * FEATURE: Aggressive Direct Master MD Query Reading & Literal Snippet Selection.
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
  
  // 1. Core Analysis
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const extractedSLOs = extractSLOCodes(userPrompt);
  const primarySLO = extractedSLOs.length > 0 ? extractedSLOs[0] : null;

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
  const documentIds = activeDocs?.map(d => d.id) || [];
  
  const dialectTag = activeDoc?.extracted_text?.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

  const pedagogyDNA = `
### PEDAGOGICAL_IDENTITY: ${dialectTag}
- AUTHORITY: ${activeDoc?.authority || 'Independent'}
- DIALECT: ${dialectTag.includes('Pakistani') ? 'Sindh/Federal (SLO-Based)' : 'International (Criteria-Based)'}
`;

  let vaultContent = "";
  let hardLockFound = false;

  // 3. MASTER MD DIRECT FETCH (LITERAL GRID SCAN)
  if (activeDoc?.extracted_text) {
    const md = activeDoc.extracted_text;
    const targets: string[] = [];
    
    if (primarySLO) targets.push(primarySLO);
    
    // Add significant keywords from analysis for literal matching
    const keywords = queryAnalysis.keywords || [];
    keywords.forEach(k => { if (k.length > 4) targets.push(k); });

    const snippets: string[] = [];
    targets.forEach(target => {
      let pos = md.indexOf(target);
      let count = 0;
      while (pos !== -1 && count < 3) {
        const start = Math.max(0, pos - 1500);
        const end = Math.min(md.length, pos + 4000);
        snippets.push(`[DIRECT_MASTER_MD_FETCH: "${target}"]\n${md.substring(start, end)}`);
        pos = md.indexOf(target, pos + target.length + 100);
        count++;
        hardLockFound = true;
      }
    });

    if (snippets.length > 0) {
      vaultContent += `\n### MASTER_MD_LITERAL_EXTRACTION [!!! HIGH_FIDELITY_SOURCE !!!]\n${snippets.join('\n---\n')}\n`;
    }
  }

  // 4. Vector Augmentation
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    retrievedChunks = await retrieveRelevantChunks({
      query: userPrompt,
      documentIds,
      supabase,
      matchCount: 15
    });
  }

  if (retrievedChunks.length > 0) {
    vaultContent += retrievedChunks
      .map((chunk, i) => {
        const isVerbatim = primarySLO && chunk.chunk_text.includes(primarySLO);
        if (isVerbatim) hardLockFound = true;
        return `### VECTOR_NODE_${i + 1}${isVerbatim ? " [!!! VERBATIM_CURRICULUM_STANDARD !!!]" : ""}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  }

  // 5. Synthesis Architecture
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, activeDoc);
  const systemInstruction = customSystem || DEFAULT_MASTER_PROMPT;

  const finalPrompt = `
<PEDAGOGICAL_DNA>
${pedagogyDNA}
${adaptiveContext || ''}
</PEDAGOGICAL_DNA>

<AUTHORITATIVE_VAULT>
${vaultContent || '[VAULT_EMPTY: No direct matches found in Master MD or Vector Nodes]'}
</AUTHORITATIVE_VAULT>

## MISSION:
Synthesize content based ONLY on the provided AUTHORITATIVE_VAULT snippets.

## GROUNDING_PROTOCOL:
1. MASTER_MD_READ: You have been given literal blocks extracted from the Master MD file for the query: "${userPrompt}".
2. FIDELITY: Maintain 100% adherence to codes and definitions found in the vault.

## EXECUTION_SPEC:
${responseInstructions}`;

  const result = await synthesize(finalPrompt, history.slice(-6), hardLockFound, [], 'gemini', systemInstruction);
  
  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      isGrounded: hardLockFound,
      dialect: dialectTag,
      sourceDocument: activeDoc?.name || 'Global Node',
      groundingMethod: hardLockFound ? 'Master MD Direct Read' : 'Semantic Vector'
    }
  };
}