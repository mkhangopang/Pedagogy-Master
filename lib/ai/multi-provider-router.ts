import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes } from '../rag/slo-extractor';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * WORLD-CLASS NEURAL SYNTHESIS ORCHESTRATOR (v118.0)
 * Signature: Multi-Dialect Context Locking & Master MD Topic Scanning.
 * FEATURE: Hybrid Literal/Semantic Search across Master MD for maximum grounding.
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
  
  // 1. Analysis Architecture
  const queryAnalysis = analyzeUserQuery(userPrompt);
  const extractedSLOs = extractSLOCodes(userPrompt);
  const primarySLO = extractedSLOs.length > 0 ? extractedSLOs[0] : null;

  // 2. Resolve Active Institutional Identity
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
  
  // Extract Dialect metadata
  const dialectTag = activeDoc?.extracted_text?.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

  const pedagogyDNA = `
### PEDAGOGICAL_IDENTITY: ${dialectTag}
- AUTHORITY: ${activeDoc?.authority || 'Independent'}
- DIALECT: ${dialectTag.includes('Pakistani') ? 'Sindh/Federal (SLO-Based)' : 'International (Criteria-Based)'}
`;

  let vaultContent = "";
  let hardLockFound = false;
  let retrievedChunks: RetrievedChunk[] = [];

  // 3. ENHANCED MASTER MD SCAN (Literal Priority)
  if (activeDoc?.extracted_text) {
    const md = activeDoc.extracted_text;
    const matches: { index: number; trigger: string }[] = [];

    // Protocol A: SLO Code Scan
    if (primarySLO) {
      let pos = md.indexOf(primarySLO);
      while (pos !== -1) {
        matches.push({ index: pos, trigger: `SLO_CODE:${primarySLO}` });
        pos = md.indexOf(primarySLO, pos + 1);
      }
    }

    // Protocol B: Topical Keyword Scan (Reading the Master MD specifically for the query)
    const keywords = queryAnalysis.keywords || [];
    keywords.forEach(kw => {
      if (kw.length < 3) return;
      let pos = md.indexOf(kw);
      // We only take the first few topical matches to avoid vault overflow
      let count = 0;
      while (pos !== -1 && count < 2) {
        matches.push({ index: pos, trigger: `TOPIC:${kw}` });
        pos = md.indexOf(kw, pos + 1);
        count++;
      }
    });

    if (matches.length > 0) {
      console.log(`🎯 [Master MD Scan] ${matches.length} Matches Found via ${matches.map(m => m.trigger).join(', ')}`);
      hardLockFound = true;
      
      // Sort matches by index to merge overlapping windows
      matches.sort((a, b) => a.index - b.index);
      
      const snippets = matches.map(match => {
        const start = Math.max(0, match.index - 1200);
        const end = Math.min(md.length, match.index + 3500);
        return `[TRIGGER: ${match.trigger}]\n${md.substring(start, end)}`;
      });
      
      vaultContent += `\n### MASTER_MD_DIRECT_EXTRACTION [!!! AUTHORITATIVE_SOURCE_TRUTH !!!]\n${snippets.join('\n---\n')}\n`;
    }
  }

  // 4. Dual-Stage Vault Retrieval (Vector Augmentation)
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
        const isVerbatim = primarySLO && (
          chunk.slo_codes?.includes(primarySLO) || 
          chunk.chunk_text.includes(primarySLO)
        );
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
${vaultContent || '[VAULT_EMPTY: Asset linkage required for this node. Use Global Knowledge Fallback.]'}
</AUTHORITATIVE_VAULT>

## MISSION:
Generate an artifact with 100% fidelity to the AUTHORITATIVE_VAULT.

## GROUNDING_PROTOCOL:
1. MASTER_MD_READ: You have been provided with literal snippets from the curriculum's "Master MD" file. Use these as the primary source for all definitions and standards.
2. HARD-LOCK: Quote verbatim codes and descriptions found in the vault.
3. ZERO HALLUCINATION: If the vault doesn't cover the specific SLO or topic requested, proceed with "GLOBAL KNOWLEDGE FALLBACK".

## COMMAND:
"${userPrompt}"

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
      chunksUsed: retrievedChunks.length,
      groundingMethod: hardLockFound ? 'Master MD Literal' : 'Vector Semantic'
    }
  };
}
