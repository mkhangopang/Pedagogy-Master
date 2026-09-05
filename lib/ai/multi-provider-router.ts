import { SupabaseClient } from '@supabase/supabase-js';
import { synthesize, synthesizeStream } from './synthesizer-core';
import { retrieveRelevantChunks } from '../rag/retriever';
import { extractSLOCodes, normalizeSLO } from '../rag/slo-extractor';
import { indexDocumentForRAG } from '../rag/document-indexer';
import { classifyIntent } from './intent-classifier';
import { kv } from '../kv';
import { createHash } from 'crypto';
import { isAdminUser } from '../auth/user-role';
import { UserProfile } from '../../types';

function normalizeGradeString(grade: string | null | undefined): string {
  if (!grade) return '';
  const clean = String(grade).trim().toLowerCase();
  const romanMap: Record<string, string> = {
    'i': '01', '1': '01', '01': '01',
    'ii': '02', '2': '02', '02': '02',
    'iii': '03', '3': '03', '03': '03',
    'iv': '04', '4': '04', '04': '04',
    'v': '05', '5': '05', '05': '05',
    'vi': '06', '6': '06', '06': '06',
    'vii': '07', '7': '07', '07': '07',
    'viii': '08', '8': '08', '08': '08',
    'ix': '09', '9': '09', '09': '09',
    'x': '10', '10': '10',
    'xi': '11', '11': '11',
    'xii': '12', '12': '12'
  };
  const numMatch = clean.match(/(\d+|[ivx]+)/i);
  if (numMatch) {
    const val = numMatch[1];
    if (romanMap[val]) return romanMap[val];
    if (!isNaN(parseInt(val, 10))) return String(parseInt(val, 10)).padStart(2, '0');
  }
  return clean;
}

function extractTargetGrade(prompt: string): string | null {
  const p = prompt.toLowerCase();
  const gradeMatch = p.match(/\b(?:grade|gr|class)\s*([0-9]{1,2}|[ivxlcdm]+)\b/i);
  if (gradeMatch) {
    return normalizeGradeString(gradeMatch[1]);
  }
  if (/\b(?:grade\s+one|first\s+grade|grade\s+1)\b/i.test(p)) return '01';
  if (/\b(?:grade\s+two|second\s+grade|grade\s+2)\b/i.test(p)) return '02';
  if (/\b(?:grade\s+three|third\s+grade|grade\s+3)\b/i.test(p)) return '03';
  return null;
}

function extractRequestedCount(prompt: string): number {
  const p = prompt.toLowerCase();
  const match = p.match(/\b(?:first|top|initial)\s*(\d+)\b/i) || p.match(/\b(\d+)\s*slos?\b/i);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0) return Math.min(num, 30);
  }
  if (/\bfirst\s+(?:five|5)\b/i.test(p)) return 5;
  if (/\bfirst\s+(?:three|3)\b/i.test(p)) return 3;
  if (/\bfirst\s+(?:ten|10)\b/i.test(p)) return 10;
  return 10;
}

interface GroundedVaultResult {
  vaultContent: string;
  isGrounded: boolean;
  topChunkIds: string[];
  sourceDocName: string;
  activeDoc: any | null;
}

async function buildGroundedVaultContext({
  userPrompt,
  priorityDocumentId,
  effectiveDocumentIds,
  supabase,
}: {
  userPrompt: string;
  priorityDocumentId?: string;
  effectiveDocumentIds: string[];
  supabase: SupabaseClient;
}): Promise<GroundedVaultResult> {
  let vaultContent = '';
  let isGrounded = false;
  let topChunkIds: string[] = [];
  let sourceDocName = '';
  let activeDoc: any = null;

  if (priorityDocumentId) {
    const { data: doc } = await supabase
      .from('documents')
      .select('id, name, authority, subject, grade_level, master_md_dialect, extracted_text, generated_json, document_summary')
      .eq('id', priorityDocumentId)
      .single();

    if (doc) {
      activeDoc = doc;
      sourceDocName = doc.name;

      // 1. Authoritative SLO Database Lookup
      const targetGrade = extractTargetGrade(userPrompt);
      const requestedCount = extractRequestedCount(userPrompt);
      const promptCodes = extractSLOCodes(userPrompt);

      const { data: slos } = await supabase
        .from('slo_database')
        .select('*')
        .eq('document_id', priorityDocumentId)
        .order('created_at', { ascending: true });

      if (slos && slos.length > 0) {
        let selectedSlos: any[] = [];

        // A. Direct code matches in prompt
        if (promptCodes.length > 0) {
          const normCodes = promptCodes.map(c => normalizeSLO(c.code));
          selectedSlos = slos.filter(s => s.slo_code && normCodes.includes(normalizeSLO(s.slo_code)));
        }

        // B. Target grade match
        if (selectedSlos.length === 0 && targetGrade) {
          const gradeSlos = slos.filter(s => normalizeGradeString(s.grade_level) === targetGrade);
          if (gradeSlos.length > 0) {
            gradeSlos.sort((a, b) => (a.slo_code || '').localeCompare(b.slo_code || ''));
            selectedSlos = gradeSlos.slice(0, requestedCount);
          }
        }

        // C. Specific request for "first N" or "SLOs" without specific grade
        if (selectedSlos.length === 0 && (/\b(?:first|top|initial)\s*\d+/i.test(userPrompt) || /\bslos?\b/i.test(userPrompt))) {
          const sortedSlos = [...slos].sort((a, b) => {
            const gA = normalizeGradeString(a.grade_level);
            const gB = normalizeGradeString(b.grade_level);
            if (gA !== gB) return gA.localeCompare(gB);
            return (a.slo_code || '').localeCompare(b.slo_code || '');
          });
          selectedSlos = sortedSlos.slice(0, requestedCount);
        }

        // D. Keyword matches in SLO standard text or domain
        if (selectedSlos.length === 0) {
          const keywords = userPrompt.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const matched = slos.filter(s => {
            const full = `${s.slo_full_text || ''} ${s.domain_name || ''} ${s.subject || ''} ${(s.keywords || []).join(' ')}`.toLowerCase();
            return keywords.some(k => full.includes(k));
          });
          if (matched.length > 0) {
            matched.sort((a, b) => (a.slo_code || '').localeCompare(b.slo_code || ''));
            selectedSlos = matched.slice(0, requestedCount);
          }
        }

        // E. Fallback to first available SLOs from the database if still empty
        if (selectedSlos.length === 0) {
          const sortedSlos = [...slos].sort((a, b) => {
            const gA = normalizeGradeString(a.grade_level);
            const gB = normalizeGradeString(b.grade_level);
            if (gA !== gB) return gA.localeCompare(gB);
            return (a.slo_code || '').localeCompare(b.slo_code || '');
          });
          selectedSlos = sortedSlos.slice(0, requestedCount);
        }

        if (selectedSlos.length > 0) {
          isGrounded = true;
          vaultContent += `### AUTHENTIC_CURRICULUM_STANDARDS (${doc.name})\n`;
          selectedSlos.forEach(s => {
            vaultContent += `[OFFICIAL_SLO_RECORD: ${s.slo_code || s.raw_code_as_found || 'SLO'}]\n` +
              `Grade: ${s.grade_level || 'N/A'} | Domain: ${s.domain_name || s.domain || 'N/A'}\n` +
              `Bloom's Taxonomy: ${s.bloom_level || 'N/A'} | Cognitive Complexity / DOK: ${s.cognitive_complexity || s.dok_level || 'N/A'}\n` +
              `Standard / Full Text: ${s.slo_full_text}\n` +
              (s.teaching_strategies?.length ? `Teaching Strategies: ${s.teaching_strategies.join(', ')}\n` : '') +
              (s.assessment_ideas?.length ? `Assessment Ideas: ${s.assessment_ideas.join(', ')}\n` : '') +
              (s.prerequisite_concepts?.length ? `Prerequisites: ${s.prerequisite_concepts.join(', ')}\n` : '') +
              (s.common_misconceptions?.length ? `Common Misconceptions: ${s.common_misconceptions.join(', ')}\n` : '') +
              `\n`;
          });
        }
      }

      // 2. Structured JSON / Extracted Text Ingestion (if present)
      if (doc.extracted_text) {
        try {
          const parsed = JSON.parse(doc.extracted_text);
          if (parsed.grades) {
            isGrounded = true;
            vaultContent += `### CURRICULUM_STRUCTURE\n` +
              `Curriculum: ${parsed.curriculum?.name || doc.name}\n` +
              `Subject: ${parsed.curriculum?.subject || doc.subject || 'Curriculum'}\n` +
              `Available Grades: ${Object.keys(parsed.grades).join(', ')}\n\n`;

            const gradeKey = targetGrade 
              ? Object.keys(parsed.grades).find(k => normalizeGradeString(k) === targetGrade)
              : Object.keys(parsed.grades).find(k => normalizeGradeString(k) === '01') || Object.keys(parsed.grades)[0];

            if (gradeKey && parsed.grades[gradeKey]) {
              const gVal = parsed.grades[gradeKey];
              vaultContent += `#### GRADE ${gradeKey} (${gVal.display_name || 'Grade ' + gradeKey})\n`;
              if (gVal.domains) {
                for (const [dKey, dVal] of Object.entries(gVal.domains as Record<string, any>)) {
                  vaultContent += `Domain ${dKey}: ${dVal.domain_name || dKey}\n`;
                  if (Array.isArray(dVal.slos)) {
                    dVal.slos.slice(0, requestedCount).forEach((slo: any) => {
                      vaultContent += `- ${slo.slo_id || slo.original_code || 'SLO'} [${slo.bloom_level || 'General'}]: ${slo.full_text || ''}\n`;
                    });
                  }
                }
              }
              vaultContent += '\n';
            }
          }
        } catch {
          // Plain text or markdown fallback
          if (vaultContent.length < 500 && doc.extracted_text.length > 50) {
            vaultContent += `### EXTRACTED_DOCUMENT_CONTENT\n${doc.extracted_text.substring(0, 6000)}\n\n`;
            isGrounded = true;
          }
        }
      }

      // 3. Trigger background RAG chunk indexing if document has no chunks yet
      if (doc.extracted_text && doc.extracted_text.length > 50) {
        (async () => {
          try {
            const { data: existing } = await supabase
              .from('document_chunks')
              .select('id')
              .eq('document_id', priorityDocumentId)
              .limit(1);

            if (!existing || existing.length === 0) {
              console.log(`[Router] Initializing background vector indexing for ${doc.name}...`);
              await indexDocumentForRAG(priorityDocumentId, doc.extracted_text, supabase);
            }
          } catch (err: any) {
            console.warn('[Router] Async indexing background task error:', err?.message || err);
          }
        })();
      }
    }
  }

  // 4. Semantic Retrieval Chunks
  const augmentedQuery = sourceDocName ? `${userPrompt} ${sourceDocName}` : userPrompt;
  let chunks = await retrieveRelevantChunks({
    query: augmentedQuery,
    documentIds: effectiveDocumentIds,
    supabase,
    matchCount: 15,
    dialect: activeDoc?.master_md_dialect
  });

  // Secondary chunk fallback
  if (chunks.length === 0 && priorityDocumentId) {
    const { data: genericChunks } = await supabase
      .from('document_chunks')
      .select('id, chunk_text')
      .eq('document_id', priorityDocumentId)
      .order('chunk_index', { ascending: true })
      .limit(10);

    if (genericChunks && genericChunks.length > 0) {
      chunks = genericChunks.map(c => ({
        chunk_id: c.id,
        document_id: priorityDocumentId,
        chunk_text: c.chunk_text,
        slo_codes: [],
        metadata: {},
        combined_score: 1.0
      }));
    }
  }

  const newChunks = chunks.filter(c => !topChunkIds.includes(c.chunk_id));
  if (newChunks.length > 0) {
    let formattedVault = vaultContent ? `${vaultContent}\n### RETRIEVED_CURRICULUM_CHUNKS\n` : '### AUTHORITATIVE_CURRICULUM_VAULT\n';
    newChunks.forEach((c) => {
      formattedVault += `\n[CHUNK_ID: ${c.chunk_id}]\n${c.chunk_text}\n---\n`;
    });
    vaultContent = formattedVault;
    topChunkIds = [...topChunkIds, ...newChunks.map(c => c.chunk_id)];
    isGrounded = true;
  }

  return {
    vaultContent,
    isGrounded,
    topChunkIds,
    sourceDocName,
    activeDoc
  };
}

export async function* generateAIResponseStream(
  userPrompt: string,
  history: any[],
  userId: string,
  supabase: SupabaseClient,
  adaptiveContext?: string,
  overrideDocPart?: any,
  toolType?: string,
  customSystem?: string,
  priorityDocumentId?: string
): AsyncGenerator<string> {

  // 1. Atomic Quota Enforcement with Developer Bypass
  let isDeveloper = false;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, role')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      isDeveloper = isAdminUser(profile as UserProfile);
    }
  } catch (err) {
    console.warn('[Router] Failed to verify developer status:', err);
  }

  if (!isDeveloper) {
    const today = new Date().toISOString().split('T')[0];
    const userLimitKey = `quota:${userId}:${today}`;
    const globalLimitKey = `quota:global:${today}`;

    const [userUsage, globalUsage] = await Promise.all([
      kv.incr(userLimitKey),
      kv.incr(globalLimitKey)
    ]);

    // Defaults: 50 requests per user/day, 1000 global
    const USER_LIMIT = parseInt(process.env.DAILY_USER_AI_LIMIT || '50', 10);
    const GLOBAL_LIMIT = parseInt(process.env.DAILY_GLOBAL_AI_LIMIT || '1000', 10);

    if (userUsage > USER_LIMIT) {
      yield '⚠️ **Daily Personal Quota Exceeded**: You have reached your pedagogical synthesis limit for today. Contact your administrator or wait until tomorrow.';
      return;
    }

    if (globalUsage > GLOBAL_LIMIT) {
      yield '⚠️ **System Capacity Reached**: Global AI synthesis limits have been reached for today. Please try again tomorrow.';
      return;
    }
  }

  // 2. Intent Classification
  const intentData = await classifyIntent(userPrompt);

  // 3. Document Retrieval
  let effectiveDocumentIds: string[] = [];
  if (priorityDocumentId) {
    effectiveDocumentIds = [priorityDocumentId];
  } else {
    const { data: availableDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('status', 'ready')
      .or(`user_id.eq.${userId},is_public.eq.true`)
      .limit(20);
    if (availableDocs && availableDocs.length > 0) {
      effectiveDocumentIds = availableDocs.map(d => d.id);
    }
  }

  const { vaultContent, isGrounded, topChunkIds, sourceDocName, activeDoc } = await buildGroundedVaultContext({
    userPrompt,
    priorityDocumentId,
    effectiveDocumentIds,
    supabase
  });

  // 4. Neural Synthesis Stream
  let systemInstruction = customSystem || 'You are the Pedagogy Master AI.';
  let docContext = '';
  if (priorityDocumentId) {
    docContext = `[DOCUMENT SELECTED: ${sourceDocName || 'Specific Curriculum'}]`;
    systemInstruction = `GROUNDED_RESPONSE_ENFORCED.
You are generating content FOR THE SELECTED CURRICULUM: ${sourceDocName || 'Specific Curriculum'}.
GROUNDING RULES:
1. PRIMARY_SOURCE: Use the <AUTHORITATIVE_VAULT> below as the single source of truth for all specific standards, SLOs, domains, and curriculum sequences.
2. CITATION & FIDELITY: When presenting SLOs, present the authentic standards directly from the vault with their exact codes (e.g., SLO:M-01-A-01), domain, Bloom's level, and full standard text. Do not fabricate standards.
3. DIRECT FULFILLMENT: When the user asks for SLOs (such as the first 5 SLOs, or standards for a grade/domain), directly fulfill their request using the authentic curriculum records provided in the vault.
4. If a specific niche concept is not found in the vault, provide the closest relevant standards from the curriculum and label any supplementary pedagogical guidance with [GENERAL_PEDAGOGY].

${systemInstruction}`;
  } else {
    systemInstruction = `You are the Pedagogy Master AI. 
Provide pedagogical support using the available curriculum context. 
If information is missing from the vault, you may use your general pedagogical knowledge but CLEARLY state that it is not grounded in a specific institutional curriculum.

${systemInstruction}`;
  }

  const fallbackVaultNotice = `[DOCUMENT_METADATA: ${sourceDocName || 'Institutional Curriculum'}]
Subject: ${activeDoc?.subject || 'Curriculum'}
Grade Level: ${activeDoc?.grade_level || 'All Grades'}
Status: Document active in institutional vault.`;

  const finalPrompt = `
<GROUNDING_STATUS>
IS_GROUNDED: ${isGrounded ? 'YES' : 'NO'}
VAULT_SOURCE: ${priorityDocumentId || 'NONE'}
${docContext}
</GROUNDING_STATUS>

<CONTEXT>
INTENT: ${intentData.intent} | COMPLEXITY: ${intentData.complexity}
${adaptiveContext || ''}
</CONTEXT>

<AUTHORITATIVE_VAULT>
${vaultContent || fallbackVaultNotice}
</AUTHORITATIVE_VAULT>

USER_QUERY: "${userPrompt}"`;

  const stream = synthesizeStream(finalPrompt, {
    history: history.slice(-6),
    isGrounded,
    suggestedProvider: intentData.suggestedProvider,
    systemPrompt: systemInstruction,
    complexity: intentData.complexity
  });

  for await (const token of stream) {
    yield token;
  }
}

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
) {
  const start = Date.now();

  // 1. Quota Check with Developer Bypass
  let isDeveloper = false;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, role')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      isDeveloper = isAdminUser(profile as UserProfile);
    }
  } catch (err) {
    console.warn('[Router] Failed to verify developer status:', err);
  }

  if (!isDeveloper) {
    const today = new Date().toISOString().split('T')[0];
    const userLimitKey = `quota:${userId}:${today}`;
    const globalLimitKey = `quota:global:${today}`;

    const [userUsage, globalUsage] = await Promise.all([
      kv.incr(userLimitKey),
      kv.incr(globalLimitKey)
    ]);

    const USER_LIMIT = parseInt(process.env.DAILY_USER_AI_LIMIT || '50', 10);
    const GLOBAL_LIMIT = parseInt(process.env.DAILY_GLOBAL_AI_LIMIT || '1000', 10);

    if (userUsage > USER_LIMIT) {
      return {
        text: '⚠️ **Daily Personal Quota Exceeded**: You have reached your pedagogical synthesis limit for today.',
        provider: 'System Enforcement',
        metadata: { quotaExceeded: true }
      };
    }

    if (globalUsage > GLOBAL_LIMIT) {
      return {
        text: '⚠️ **System Capacity Reached**: Global AI limits have been reached for today. Please try again tomorrow.',
        provider: 'System Enforcement',
        metadata: { quotaExceeded: true }
      };
    }
  }

  // 2. Intent Classification
  const intentData = await classifyIntent(userPrompt);

  // 3. Cache Lookup (SHA-256)
  const cacheKey = `synth:${createHash('sha256').update(userPrompt).digest('hex')}`;
  const cached = await kv.get<string>(cacheKey);
  if (cached) return { text: cached, provider: 'Neural Cache', metadata: { cached: true } };

  // 4. Document Retrieval
  let effectiveDocumentIds: string[] = [];
  if (priorityDocumentId) {
    effectiveDocumentIds = [priorityDocumentId];
  } else {
    const { data: availableDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('status', 'ready')
      .or(`user_id.eq.${userId},is_public.eq.true`)
      .limit(15);
    
    if (availableDocs && availableDocs.length > 0) {
      effectiveDocumentIds = availableDocs.map(d => d.id);
    }
  }

  const { vaultContent, isGrounded, topChunkIds, sourceDocName, activeDoc } = await buildGroundedVaultContext({
    userPrompt,
    priorityDocumentId,
    effectiveDocumentIds,
    supabase
  });

  // 5. Neural Synthesis
  let systemInstruction = customSystem || 'You are the Pedagogy Master AI.';
  let docContext = '';
  if (priorityDocumentId) {
    docContext = `[DOCUMENT SELECTED: ${sourceDocName || 'Specific Curriculum'}]`;
    systemInstruction = `GROUNDED_RESPONSE_ENFORCED.
You are generating content FOR THE SELECTED CURRICULUM: ${sourceDocName || 'Specific Curriculum'}.
GROUNDING RULES:
1. PRIMARY_SOURCE: Use the <AUTHORITATIVE_VAULT> below as the single source of truth for all specific standards, SLOs, domains, and curriculum sequences.
2. CITATION & FIDELITY: When presenting SLOs, present the authentic standards directly from the vault with their exact codes (e.g., SLO:M-01-A-01), domain, Bloom's level, and full standard text. Do not fabricate standards.
3. DIRECT FULFILLMENT: When the user asks for SLOs (such as the first 5 SLOs, or standards for a grade/domain), directly fulfill their request using the authentic curriculum records provided in the vault.
4. If a specific niche concept is not found in the vault, provide the closest relevant standards from the curriculum and label any supplementary pedagogical guidance with [GENERAL_PEDAGOGY].

${systemInstruction}`;
  } else {
    systemInstruction = `You are the Pedagogy Master AI. 
Provide pedagogical support using the available curriculum context. 
If information is missing from the vault, you may use your general pedagogical knowledge but CLEARLY state that it is not grounded in a specific institutional curriculum.

${systemInstruction}`;
  }

  const fallbackVaultNotice = `[DOCUMENT_METADATA: ${sourceDocName || 'Institutional Curriculum'}]
Subject: ${activeDoc?.subject || 'Curriculum'}
Grade Level: ${activeDoc?.grade_level || 'All Grades'}
Status: Document active in institutional vault.`;

  const finalPrompt = `
<GROUNDING_STATUS>
IS_GROUNDED: ${isGrounded ? 'YES' : 'NO'}
VAULT_SOURCE: ${priorityDocumentId || 'NONE'}
${docContext}
</GROUNDING_STATUS>

<CONTEXT>
INTENT: ${intentData.intent} | COMPLEXITY: ${intentData.complexity}
${adaptiveContext || ''}
</CONTEXT>

<AUTHORITATIVE_VAULT>
${vaultContent || fallbackVaultNotice}
</AUTHORITATIVE_VAULT>

USER_QUERY: "${userPrompt}"`;

  const result = await synthesize(finalPrompt, {
    history: history.slice(-6),
    isGrounded,
    suggestedProvider: intentData.suggestedProvider,
    systemPrompt: systemInstruction,
    complexity: intentData.complexity
  });

  const latency = Date.now() - start;

  // Logging
  supabase.from('retrieval_logs').insert({
    user_id: userId,
    query_text: userPrompt,
    top_chunk_ids: topChunkIds,
    confidence_score: isGrounded ? 0.95 : 0.4,
    latency_ms: latency,
    provider_used: result.provider
  }).then();

  // Selective Caching
  const isCacheable = intentData.complexity < 3 && intentData.intent === 'lookup' 
    && !userPrompt.includes('create') && !userPrompt.includes('generate');

  if (isCacheable) {
    await kv.set(cacheKey, result.text, 3600);
  }

  return {
    text: result.text,
    provider: result.provider,
    metadata: {
      isGrounded,
      sourceDocument: sourceDocName,
      intent: intentData.intent,
      latency,
      chunkCount: topChunkIds.length
    }
  };
}
