import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { synthesize, getProvidersConfig } from './synthesizer-core';
import { retrieveRelevantChunks, RetrievedChunk } from '../rag/retriever';
import { extractSLOCodes, extractGradeFromSLO } from '../rag/slo-extractor';
import { NUCLEAR_GROUNDING_DIRECTIVE, DEFAULT_MASTER_PROMPT } from '../../constants';

/**
 * Provides status of all configured AI nodes.
 */
export async function getProviderStatus() {
  const configs = getProvidersConfig();
  return Promise.all(configs.map(async (config) => {
    const remaining = await rateLimiter.getRemainingRequests(config.name, config);
    return {
      name: config.name,
      enabled: config.enabled,
      remaining,
      limits: { rpm: config.rpm, rpd: config.rpd }
    };
  }));
}

/**
 * NEURAL SYNTHESIS ORCHESTRATOR (v46.0)
 * Optimized for Depth RAG and Global Pedagogy Insights.
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
  
  // 1. Metadata Extraction
  const extractedSLOs = extractSLOCodes(userPrompt);
  const targetSLO = extractedSLOs.length > 0 ? extractedSLOs[0] : null;
  const isolatedGrade = targetSLO ? extractGradeFromSLO(targetSLO) : null;

  // Detect mode flags from enhanced Tools.tsx prompt prefix
  const isGlobalEnabled = userPrompt.includes('GLOBAL_RESOURCES_MODE: ACTIVE');
  const isCurriculumEnabled = userPrompt.includes('CURRICULUM_MODE: ACTIVE');

  // 2. Context Scoping
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('id, name, rag_indexed, authority, subject, grade_level, version_year, extracted_text')
    .eq('user_id', userId)
    .eq('is_selected', true); 
  
  const activeDocs = selectedDocs || [];
  let documentIds = isCurriculumEnabled ? (activeDocs.map(d => d.id) || []) : [];
  
  if (priorityDocumentId && isCurriculumEnabled && !documentIds.includes(priorityDocumentId)) {
    documentIds = [priorityDocumentId, ...documentIds];
  }

  // 3. Retrieval (Performance Optimized for Depth Scanning)
  let retrievedChunks: RetrievedChunk[] = [];
  if (documentIds.length > 0) {
    try {
      retrievedChunks = await retrieveRelevantChunks({
        query: userPrompt,
        documentIds: documentIds,
        supabase,
        matchCount: 40 // Broad scan to find granular SLOs at the bottom of files
      });

      if (isolatedGrade) {
        retrievedChunks = retrievedChunks.filter(chunk => {
          const chunkGrades = chunk.grade_levels || [];
          return chunkGrades.length === 0 || chunkGrades.includes(isolatedGrade);
        });
      }
    } catch (err) {
      console.warn("⚠️ [Orchestrator] Vector Node Lag.");
    }
  }
  
  // 4. Vault Construction
  let vaultContent = "";
  if (retrievedChunks.length > 0) {
    vaultContent = retrievedChunks
      .map((chunk, i) => {
        const isExact = targetSLO && (chunk.slo_codes || []).includes(targetSLO);
        const tagLine = isExact ? " [!!! PRIORITY TARGET MATCH !!!]" : "";
        return `[NODE_${i + 1}] (SOURCE: ${activeDocs.find(d => d.id === chunk.document_id)?.name || 'Library'})${tagLine}\n${chunk.chunk_text}\n---`;
      })
      .join('\n');
  } else if (activeDocs.length > 0 && isCurriculumEnabled) {
    vaultContent = `[FALLBACK] (SOURCE: ${activeDocs[0].name})\n${activeDocs[0].extracted_text?.substring(0, 5000)}`;
  }

  // 5. Global Resource Injection (Strategic Pedagogy Node)
  let globalInstruction = "";
  if (isGlobalEnabled) {
    globalInstruction = `
### 🌐 GLOBAL PEDAGOGY AUGMENTATION (PRO MODE)
Integrate instructional strategies from world-leading education systems:
- **Singapore Math**: Concrete-Pictorial-Abstract (CPA) sequences.
- **Finland/Sweden**: Phenomenon-based learning and student-led inquiry.
- **Japan**: "Lesson Study" style meticulous instructional flow and observation-ready prompts.
- **USA/UK**: Explicit Instruction (Rosenshine's Principles) and UDL-based differentiation.
- **Norway/EU**: High emphasis on cross-curricular synthesis and real-world application.
Blend these insights into the output while respecting the local curriculum standards if selected.
`;
  }

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const primaryDoc = activeDocs.find(d => d.id === (priorityDocumentId || (documentIds.length > 0 ? documentIds[0] : null))) || activeDocs[0];
  const responseInstructions = formatResponseInstructions(queryAnalysis, toolType, primaryDoc);

  let targetEnforcement = "";
  if (targetSLO && isCurriculumEnabled) {
    targetEnforcement = `\n🔴 CRITICAL_CONTEXT_LOCK: Requested [${targetSLO}]. MUST search vault for EXACT code.\n`;
  }

  let finalPrompt = `
<AUTHORITATIVE_VAULT>
${vaultContent}
</AUTHORITATIVE_VAULT>

${isCurriculumEnabled ? NUCLEAR_GROUNDING_DIRECTIVE : '⚠️ VAULT BYPASSED: Using General Knowledge/Global Strategies only.'}
${targetEnforcement}
${globalInstruction}

## TEACHER COMMAND:
"${userPrompt}"

## EXECUTION PARAMETERS:
${responseInstructions}`;

  // 6. Synthesis
  const isComplexTask = targetSLO || toolType === 'lesson-plan' || userPrompt.length > 200;
  const preferredProvider = isComplexTask ? 'gemini' : undefined;
  
  const result = await synthesize(
    finalPrompt, 
    history.slice(-4), 
    retrievedChunks.length > 0, 
    [], 
    preferredProvider,
    customSystem || DEFAULT_MASTER_PROMPT
  );
  
  const sources = [
    ...(result.groundingMetadata?.groundingChunks?.map((c: any) => c.web).filter(Boolean) || []),
    ...(result.groundingMetadata?.groundingChunks?.map((c: any) => c.maps).filter(Boolean) || [])
  ];

  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      chunksUsed: retrievedChunks.length,
      isGrounded: isCurriculumEnabled && retrievedChunks.length > 0,
      isGlobal: isGlobalEnabled,
      sourceDocument: primaryDoc?.name || 'Global Library',
      extractedSLOs,
      sources: sources.length > 0 ? sources : undefined,
      gradeIsolation: isolatedGrade
    }
  };
}
