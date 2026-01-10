
import { SupabaseClient } from '@supabase/supabase-js';
import { rateLimiter } from './rate-limiter';
import { responseCache } from './response-cache';
import { SYSTEM_PERSONALITY, RESPONSE_LENGTH_GUIDELINES } from '../config/ai-personality';
import { analyzeUserQuery } from './query-analyzer';
import { formatResponseInstructions } from './response-formatter';
import { fetchAndIndexDocuments, buildDocumentAwarePrompt } from '../documents/document-processor-runtime';
import { getCachedOrGenerate } from './intelligent-cache';
import { generateLearningPath } from './learning-path';
import { synthesize, PROVIDERS, MODEL_SPECIALIZATION } from './synthesizer-core';
import { getObjectBuffer } from '../r2';

function buildInstantSLOResponse(sloData: any): string {
  return `
**SLO ${sloData.slo_code}:**
"${sloData.slo_full_text}"

**Pedagogical Context:**
This objective maps to the **${sloData.bloom_level}** cognitive level (${sloData.cognitive_complexity || 'Standard'} complexity).

**Core Concepts:**
${sloData.keywords?.slice(0, 5).map((k: string) => `- ${k}`).join('\n') || '- Refer to curriculum documentation.'}

${sloData.prerequisite_concepts && sloData.prerequisite_concepts.length > 0 ? `
**Prerequisites:**
${sloData.prerequisite_concepts.map((p: string) => `- ${p}`).join('\n')}
` : ''}

${sloData.common_misconceptions && sloData.common_misconceptions.length > 0 ? `
**Misconception Alerts:**
${sloData.common_misconceptions.map((m: string) => `- ${m}`).join('\n')}
` : ''}

*Options: [Generate Lesson Plan] | [Strategies] | [Quiz]*
`;
}

function buildEnhancedContextWithSLOData(sloData: any): string {
  return `
--- HIGH-PRECISION SLO METADATA FOUND ---
CODE: ${sloData.slo_code}
CONTENT: ${sloData.slo_full_text}
BLOOM LEVEL: ${sloData.bloom_level}
COMPLEXITY: ${sloData.cognitive_complexity || 'Medium'}
TEACHING STRATEGIES: ${sloData.teaching_strategies?.join(', ') || 'N/A'}
ASSESSMENT IDEAS: ${sloData.assessment_ideas?.join(', ') || 'N/A'}
PREREQUISITES: ${sloData.prerequisite_concepts?.join(', ') || 'N/A'}
MISCONCEPTIONS: ${sloData.common_misconceptions?.join(', ') || 'N/A'}
--- END STRUCTURED DATA ---
`;
}

/**
 * ASSET VAULT SYNCHRONIZER
 * Fetches selected documents from R2 for multimodal synthesis.
 * Only includes MIME types natively supported by Gemini vision/PDF parsing.
 */
async function fetchMultimodalContext(userId: string, supabase: SupabaseClient) {
  const { data: selectedDocs } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .eq('is_selected', true)
    .limit(5);

  if (!selectedDocs || selectedDocs.length === 0) return [];

  // Gemini supported multimodal types for curriculum ingestion
  const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  const parts = [];
  for (const doc of selectedDocs) {
    if (!supportedTypes.includes(doc.mime_type)) continue;
    
    try {
      const buffer = await getObjectBuffer(doc.file_path);
      if (buffer) {
        parts.push({
          inlineData: {
            mimeType: doc.mime_type,
            data: buffer.toString('base64')
          }
        });
      }
    } catch (e) {
      console.warn(`[Vault Sync Warning] Failed to ingest ${doc.name}:`, e);
    }
  }
  return parts;
}

export async function generateAIResponse(
  userPrompt: string,
  history: any[],
  userId: string,
  supabase: SupabaseClient,
  adaptiveContext?: string,
  overrideDocPart?: any, 
  toolType?: string
): Promise<{ text: string; provider: string }> {
  const cached = responseCache.get(userPrompt, history);
  if (cached) return { text: cached, provider: 'cache' };

  const queryAnalysis = analyzeUserQuery(userPrompt);
  const preferredProvider = MODEL_SPECIALIZATION[queryAnalysis.queryType] || 'groq';

  let structuredContext = '';
  if (queryAnalysis.extractedSLO) {
    const { data: sloData } = await supabase
      .from('slo_database')
      .select('*, documents!inner(user_id)')
      .eq('slo_code', queryAnalysis.extractedSLO)
      .eq('documents.user_id', userId)
      .maybeSingle();

    if (sloData) {
      if (queryAnalysis.queryType === 'lookup') {
        const instantResponse = buildInstantSLOResponse(sloData);
        responseCache.set(userPrompt, history, instantResponse, 'database-cache');
        return { text: instantResponse, provider: 'database-cache' };
      }

      const cacheableTypes = ['lesson_plan', 'teaching', 'assessment'];
      if (cacheableTypes.includes(queryAnalysis.queryType)) {
        const cacheType = queryAnalysis.queryType === 'teaching' ? 'teaching_strategies' : queryAnalysis.queryType;
        try {
          const cachedContent = await getCachedOrGenerate(queryAnalysis.extractedSLO, cacheType as any, userId);
          return { text: cachedContent, provider: 'intelligent-cache' };
        } catch (e) {
          console.warn("Artifact Cache miss, synthesizing fresh...");
        }
      }
      
      structuredContext = buildEnhancedContextWithSLOData(sloData);
    }
  }

  if (toolType === 'learning-path' && queryAnalysis.extractedSLO) {
    const path = await generateLearningPath(queryAnalysis.extractedSLO, userId);
    const pathText = `**Prerequisite Learning Chain for ${queryAnalysis.extractedSLO}:**\n\n${path.map((code, i) => `${i + 1}. **${code}**`).join(' → ')}\n\n*Mastery of preceding concepts is recommended for instructional success.*`;
    return { text: pathText, provider: 'curriculum-graph' };
  }

  // CORE RAG FLOW
  const documentIndex = await fetchAndIndexDocuments(userId);
  const docParts = await fetchMultimodalContext(userId, supabase);
  const hasDocs = documentIndex.documentCount > 0 || docParts.length > 0 || !!structuredContext;
  
  const responseInstructions = formatResponseInstructions(queryAnalysis);
  const lengthGuideline = RESPONSE_LENGTH_GUIDELINES[queryAnalysis.expectedResponseLength].instruction;

  const { prompt: enhancedPrompt } = buildDocumentAwarePrompt(userPrompt, documentIndex);

  let documentContext = structuredContext;
  if (documentIndex.documentCount > 0) {
    documentContext += documentIndex.documents.map(d => `\nSOURCE: ${d.filename}\n${d.content}`).join('\n');
  }

  const finalPrompt = `
${SYSTEM_PERSONALITY}
${hasDocs ? `🔴 ASSET_VAULT ACTIVE\n${documentContext}` : '⚠️ GENERAL MODE - NO LOCAL CONTEXT'}
---
Teacher Query: ${enhancedPrompt}
---
Instruction: Ground your response strictly in the provided ASSET_VAULT if applicable.
${adaptiveContext || ''}
${responseInstructions}
${lengthGuideline}
`;

  const result = await synthesize(finalPrompt, history, hasDocs, docParts, preferredProvider);
  responseCache.set(userPrompt, history, result.text, result.provider);
  return result;
}

export function getProviderStatus() {
  return PROVIDERS.map(config => ({
    name: config.name,
    enabled: config.enabled,
    limits: { rpm: config.rpm, rpd: config.rpd },
    remaining: rateLimiter.getRemainingRequests(config.name, config)
  }));
}
