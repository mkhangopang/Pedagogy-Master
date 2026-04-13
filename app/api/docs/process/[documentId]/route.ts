// app/api/docs/process/[documentId]/route.ts
// PEDAGOGY MASTER AI — Ingestion Engine v7.0
// ─────────────────────────────────────────────────────────────────────────────
// FIXES APPLIED:
//   BUG-01  Wrong Gemini model names → gemini-2.0-flash / gemini-2.0-flash-lite
//   BUG-02  NEXT_PUBLIC_ API key exposure → server-only env vars
//   BUG-03  Completed job re-triggers ingestion → getJobStatus returns all jobs
//   BUG-04  Fire-and-forget killed by serverless → unstable_after
//   BUG-06  MODEL_PRIMARY === MODEL_FALLBACK → different tiers now
//   BUG-07  seenCodes lost on resume → hydrated from DB at start of LINEARIZE
//   BUG-13  CONCURRENCY=8 hammers rate limits → throttled to 3
//   BUG-14  Scanned PDF gives cryptic error → human-readable detection message
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse, unstable_after as after } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep } from '../../../../../types';
import { IngestionQueue } from '../../../../../lib/jobs/ingestion-queue';
import pdf from 'pdf-parse';
import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ── CONFIG ─────────────────────────────────────────────────────────────────────
// FIX-BUG-01 + BUG-06: Correct model names AND use different models for primary/fallback
const MODEL_PRIMARY  = 'gemini-2.0-flash';       // Stable, fast, high-throughput
const MODEL_FALLBACK = 'gemini-2.0-flash-lite';  // Higher rate-limit pool — true fallback

const CHUNK_SIZE  = 10000;
const OVERLAP     = 2500;
const MIN_ADVANCE = 5000;

// FIX-BUG-13: Reduce concurrency to stay safely within Gemini's 60 RPM free limit
const BATCH_SIZE  = 30;  // Was 50
const CONCURRENCY = 3;   // Was 8 — 3×30=90 calls/iter is safe for 60 RPM

// ── LOOKUP TABLES ──────────────────────────────────────────────────────────────
const ROMAN: Record<string, string> = {
  I:'01', II:'02', III:'03', IV:'04', V:'05', VI:'06',
  VII:'07', VIII:'08', IX:'09', X:'10', XI:'11', XII:'12',
};

const PRIMARY_SUBJECTS = new Set(['M', 'S', 'E', 'U']);

const SUBJECTS: Record<string, string> = {
  B:'Biology', C:'Chemistry', P:'Physics', M:'Mathematics',
  E:'English', U:'Urdu', S:'General Science', CS:'Computer Science',
  GEO:'Geography', ECO:'Economics', PST:'Pakistan Studies',
};
const BOARD_NAMES: Record<string, string> = {
  SINDH:'Sindh Textbook Board', PUNJAB:'Punjab Curriculum & Textbook Board',
  FBISE:'Federal Board (FBISE)', KPK:'KPK Textbook Board',
  BALOCHISTAN:'Balochistan Curriculum & Textbook Board', AJK:'AJK Textbook Board',
};

// ── DETECTION ──────────────────────────────────────────────────────────────────
function detectBoard(t: string): string {
  t = t.toLowerCase();
  if (t.includes('sindh') || t.includes('jamshoro')) return 'SINDH';
  if (t.includes('punjab') || t.includes('pctb'))    return 'PUNJAB';
  if (t.includes('federal') || t.includes('fbise'))  return 'FBISE';
  if (t.includes('kpk') || t.includes('khyber'))     return 'KPK';
  if (t.includes('balochistan'))                      return 'BALOCHISTAN';
  if (t.includes('ajk'))                              return 'AJK';
  return 'SINDH';
}

function detectSubject(t: string): string {
  t = t.toLowerCase();
  if (t.includes('biology'))                               return 'B';
  if (t.includes('chemistry'))                             return 'C';
  if (t.includes('physics'))                               return 'P';
  if (t.includes('mathematics') || /\bmath\b/.test(t))    return 'M';
  if (t.includes('computer science'))                      return 'CS';
  if (t.includes('general science'))                       return 'S';
  if (t.includes('english'))                               return 'E';
  if (t.includes('urdu'))                                  return 'U';
  return 'B';
}

function normalizeGrade(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw !== 'string') raw = String(raw);
  const t = raw.trim().toUpperCase();
  if (ROMAN[t]) return ROMAN[t];
  const n = parseInt(t, 10);
  return (!isNaN(n) && n >= 1 && n <= 12) ? n.toString().padStart(2, '0') : null;
}

// ── SLO CODE NORMALIZER ────────────────────────────────────────────────────────
function normalizeCode(raw: any): string | null {
  if (!raw || raw === 'null') return null;
  if (typeof raw !== 'string') raw = String(raw);

  let s = raw.toUpperCase()
    .replace(/^\[?(?:5L0|SL[O0]|LO|SW)\s*[:\s]*/i, '')
    .replace(/[\[\]():]/g, '')
    .replace(/[.\s]/g, '')
    .trim();

  const gradeRange = s.match(/^([A-Z]{1,4})-?(\d{2})-(\d{2})-?([A-Z])-?(\d{1,3})$/);
  if (gradeRange) {
    return `${gradeRange[1]}${gradeRange[2]}${gradeRange[4]}${gradeRange[5].padStart(2, '0')}`;
  }

  s = s.replace(/-/g, '');

  s = s.replace(/([A-Z]{1,4})0[LlIi]([A-Z])/, '$101$2');
  s = s.replace(/0[LlIi]$/i, '01');
  s = s.replace(/[lI]$/i, '1');
  s = s.replace(/([A-Z])O(\d)/, '$10$2');
  s = s.replace(/(\d)O([A-Z\d])/, '$10$2');

  const romMatch = s.match(/^([A-Z]{1,4})(XII|XI|IX|X|VIII|VII|VI|V|IV|III|II)([A-Z])(\d{1,3})$/);
  if (romMatch) {
    return `${romMatch[1]}${ROMAN[romMatch[2]] ?? romMatch[2]}${romMatch[3]}${romMatch[4].padStart(2, '0')}`;
  }

  const numMatch = s.match(/^([A-Z]{1,4})(\d{1,2})([A-Z])(\d{1,3})$/);
  if (numMatch) {
    const sloNum = numMatch[4].startsWith('00') ? numMatch[4].slice(-2) : numMatch[4].padStart(2, '0');
    return `${numMatch[1]}${numMatch[2].padStart(2, '0')}${numMatch[3]}${sloNum}`;
  }

  return null;
}

// ── SLO TABLE LINEARIZER ──────────────────────────────────────────────────────
function linearizeSloText(text: string): string {
  const codeRe = /(?:\[?\s*(?:(?:5L0|SL[O0]|LO|SW|SLO)\s*[:\s]+)?([A-Z]{1,4})\s*[-\s]*\d{1,2}\s*[-\s]*[A-Z]\s*[-\s]*\d{1,2}[lI0-9]*\s*\]?)/gi;

  // FIX: Use matchAll to avoid lastIndex stale-state bugs with the 'g' flag + exec loop
  const matches = [...text.matchAll(codeRe)].map(m => ({
    start: m.index!,
    end: m.index! + m[0].length,
    raw: m[0],
  }));

  if (matches.length === 0) return text;

  type Group = { codes: string[]; start: number; end: number };
  const groups: Group[] = [];
  let i = 0;
  while (i < matches.length) {
    const group: Group = {
      codes: [matches[i].raw],
      start: matches[i].start,
      end: matches[i].end,
    };
    while (
      i + 1 < matches.length &&
      matches[i + 1].start - matches[i].end < 250 &&
      !text.slice(matches[i].end, matches[i + 1].start).includes('\n')
    ) {
      i++;
      group.codes.push(matches[i].raw);
      group.end = matches[i].end;
    }
    groups.push(group);
    i++;
  }

  let result = '';
  let lastPos = 0;

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    result += text.slice(lastPos, group.start);

    let nextGroupStart = text.length;
    if (g + 1 < groups.length) nextGroupStart = groups[g + 1].start;

    const groupTextEnd = Math.min(nextGroupStart, group.end + 1500);
    const groupText = text.slice(group.end, groupTextEnd);

    for (const code of group.codes) {
      result += `\n${code} ${groupText.replace(/[\r\n\t ]+/g, ' ').trim()}\n`;
    }

    lastPos = nextGroupStart;
  }

  result += text.slice(lastPos);
  return result;
}

// ── DOMAIN SCANNER ─────────────────────────────────────────────────────────────
function scanDomains(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /DOMAIN\s+([A-Z])\s*[:\-]\s*([^\n\r]{5,80})/gi;
  // FIX: Use matchAll for same reason as linearizeSloText
  for (const m of text.matchAll(re)) {
    const l = m[1].toUpperCase();
    if (!map[l]) map[l] = m[2].trim().replace(/\s+/g, ' ');
  }
  return map;
}

// ── SAFE JSON PARSER ───────────────────────────────────────────────────────────
function safeJson(raw: any): any {
  if (typeof raw !== 'string') {
    if (raw && typeof raw === 'object') return raw;
    raw = String(raw || '');
  }
  if (!raw?.trim()) return { slos: [] };

  const structuredMatch = raw.match(/<STRUCTURED_INDEX>([\s\S]*?)<\/STRUCTURED_INDEX>/);
  if (structuredMatch) {
    try {
      const parsed = JSON.parse(structuredMatch[1].trim());
      if (Array.isArray(parsed)) return { slos: parsed };
      return { slos: [] };
    } catch (e) {
      console.error('[safeJson] FAILED to parse STRUCTURED_INDEX:', e);
    }
  }

  let c = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  if (c.startsWith('Board:')) {
    const jsonMatch = c.match(/\{[\s\S]*\}/);
    if (jsonMatch) c = jsonMatch[0];
  } else if (!c.startsWith('{') && !c.startsWith('[') && (c.includes('{') || c.includes('['))) {
    const jsonMatch = c.match(/[\{\[][^\{\[]*[\}\]]/);
    if (jsonMatch) c = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(c);
    if (Array.isArray(parsed)) return { slos: parsed };
    return parsed;
  } catch {/* */}

  const first = c.indexOf('{');
  const last = c.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try { return JSON.parse(c.substring(first, last + 1)); } catch {/* */}
  }

  console.error('[safeJson] FAILED to parse:', c.substring(0, 200));
  return { slos: [] };
}

// ── PROCESS RAW SLOs ───────────────────────────────────────────────────────────
function processSlos(
  raw: any[],
  boardKey: string,
  subjectCode: string,
  domainMap: Record<string, string>
): any[] {
  const processed: any[] = [];
  for (const s of raw) {
    if (typeof s.slo_full_text !== 'string' || !s.slo_full_text.trim()) continue;

    const code = normalizeCode(s.slo_code);
    let grade  = normalizeGrade(s.grade || '');
    let domain = typeof s.domain === 'string' ? s.domain.trim().toUpperCase().match(/^([A-Z])/)?.[1] ?? null : null;
    let dname  = s.domain_name || null;

    if (code) {
      const m = code.match(/^[A-Z]{1,3}(\d{2})([A-Z])\d{2}$/);
      if (m) {
        if (!grade)  grade  = m[1];
        if (!domain) domain = m[2];
      }
    }
    if (domain && !dname && domainMap[domain]) dname = domainMap[domain];

    processed.push({
      slo_code              : code,
      raw_code_as_found     : s.slo_code || 'null',
      slo_full_text         : typeof s.slo_full_text === 'string' ? s.slo_full_text.trim() : '',
      grade,
      domain,
      domain_name           : dname,
      bloom_level           : s.bloom_level || null,
      cognitive_complexity  : s.cognitive_complexity || null,
      keywords              : Array.isArray(s.keywords) ? s.keywords : [],
      benchmark             : s.benchmark || null,
      subject               : SUBJECTS[subjectCode] || subjectCode,
      subject_code          : subjectCode,
      board                 : boardKey,
      is_truncated          : Boolean(s.is_truncated),
      is_orphan_domain      : !domain,
      regex_confidence      : code ? 1.0 : 0.5,
      teaching_strategies   : Array.isArray(s.teaching_strategies) ? s.teaching_strategies : [],
      assessment_ideas      : Array.isArray(s.assessment_ideas) ? s.assessment_ideas : [],
      prerequisite_concepts : Array.isArray(s.prerequisite_concepts) ? s.prerequisite_concepts : [],
      common_misconceptions : Array.isArray(s.common_misconceptions) ? s.common_misconceptions : [],
    });
  }
  return processed;
}

function extractRawSloBlocks(text: string): string[] {
  const codeRe = /(?:\[?\s*(?:(?:5L0|SL[O0]|LO|SW|SLO)\s*[:\s]+)?([A-Z]{1,4})\s*[-\s]*\d{1,2}\s*[-\s]*[A-Z]\s*[-\s]*\d{1,2}[lI0-9]*\s*\]?)/gi;
  // FIX: matchAll for correct lastIndex handling
  const allMatches = [...text.matchAll(codeRe)].map(m => ({ index: m.index!, raw: m[0] }));

  const blocks: string[] = [];
  for (let i = 0; i < allMatches.length; i++) {
    const current = allMatches[i];
    const next = allMatches[i + 1];
    const start = current.index;
    const end = next ? next.index : start + 400;
    let block = text.substring(start, end).trim();
    if (block.length > 400) block = block.substring(0, 400);
    blocks.push(block.replace(/[\r\n]+/g, ' '));
  }
  return blocks;
}

// ── EXTRACTION PROMPT ──────────────────────────────────────────────────────────
function makePrompt(
  chunk: string,
  subject: string,
  subjectCode: string,
  board: string,
  chunkN: number,
  isDeep: boolean = false
): string {
  const isPrimary = PRIMARY_SUBJECTS.has(subjectCode);

  const gradeSection = isPrimary ? `
=== GRADE SYSTEM (Primary - Grades I to VIII) ===
This is a PRIMARY curriculum covering Grades I through VIII.
Grade mapping: I→01, II→02, III→03, IV→04, V→05, VI→06, VII→07, VIII→08
ALWAYS use 2-digit grade: Grade I → 01, Grade VIII → 08` : `
=== GRADE SYSTEM (Secondary - Grades IX to XII) ===
Grade mapping: IX→09, X→10, XI→11, XII→12, always 2-digit`;

  return `IDENTITY: Pedagogy Master AI (Orchestrator)
GOAL: Clean and format the following raw SLO blocks into the Universal JSON schema.
Board: ${board} | Subject: ${subject} | Chunk: ${chunkN}

${gradeSection}

=== SLO FORMAT ===
Code: [SUB][GRADE][DOMAIN][NUM] (e.g. ${subjectCode}09A01)
JSON Fields:
- slo_code, raw_code_as_found, slo_full_text
- grade (2-digit), domain (letter), domain_name, subject

=== RULES ===
${isDeep ? '- Scan the text and extract ANY Student Learning Outcomes (SLOs) you find. Ignore junk text, table of contents, and introductions.' : '- You are receiving pre-filtered text that ONLY contains SLO codes and their descriptions.'}
- Format each block into a valid JSON object.
- Fix any OCR typos in the text.
- Return ONLY raw JSON.

=== RAW TEXT ===
${chunk}`;
}

// ── THROTTLED PARALLEL EXECUTOR ─────────────────────────────────────────────────
// FIX-BUG-13: Replaces raw Promise.all which fired 400 API calls simultaneously
async function throttledAll<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: (T | undefined)[] = new Array(tasks.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      try {
        results[i] = await tasks[i]();
      } catch (e: any) {
        console.error(`[throttledAll] Task ${i} failed:`, e.message);
        results[i] = undefined;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, runWorker));
  return results as T[];
}

// ── AI ORCHESTRATOR ────────────────────────────────────────────────────────────
async function callAIOrchestrator(
  apiKey: string,
  text: string,
  schema: any,
  subject: string,
  subjectCode: string,
  board: string,
  chunkN: number,
  isDeep: boolean = false,
  retries: number = 1
): Promise<any[]> {
  const prompt = makePrompt(text, subject, subjectCode, board, chunkN, isDeep);

  if (apiKey) {
    const ai = new GoogleGenAI({ apiKey });
    const cfg = {
      responseMimeType: 'application/json' as const,
      responseSchema  : schema,
      maxOutputTokens : 8192,
      temperature     : 0.1,
    };

    try {
      // FIX-BUG-01: Use correct model name
      const r = await ai.models.generateContent({
        model   : MODEL_PRIMARY,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config  : cfg,
      });
      const d = safeJson(r.text || '');
      if (Array.isArray(d.slos)) return d.slos;
    } catch (e: any) {
      const isQuota      = /429|quota|RESOURCE_EXHAUSTED/i.test(e.message || '');
      const isTokenLimit = /limit|token|exceeded/i.test(e.message || '');

      if (isTokenLimit) {
        console.error(`[AI] Token limit for chunk ${chunkN}.`);
        return [];
      } else if (isQuota && retries > 0) {
        console.warn(`[AI] ${MODEL_PRIMARY} quota. Retrying with 3s delay...`);
        await new Promise(r => setTimeout(r, 3000));
        return callAIOrchestrator(apiKey, text, schema, subject, subjectCode, board, chunkN, isDeep, retries - 1);
      } else if (isQuota) {
        // Try fallback model
        console.warn(`[AI] Quota exhausted. Trying fallback model ${MODEL_FALLBACK}...`);
        try {
          const r = await ai.models.generateContent({
            model   : MODEL_FALLBACK,  // FIX-BUG-06: actually different model now
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config  : cfg,
          });
          const d = safeJson(r.text || '');
          if (Array.isArray(d.slos)) return d.slos;
        } catch (e2: any) {
          console.error(`[AI] ${MODEL_FALLBACK} also failed:`, e2.message);
        }
      } else {
        console.error(`[AI] ${MODEL_PRIMARY} error:`, e.message);
      }
    }
  }

  // Final fallback to OpenAI-compatible providers
  const providers = [
    { name: 'Groq', key: process.env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    { name: 'AI Gateway', key: process.env.AI_GATEWAY_API_KEY, url: process.env.AI_GATEWAY_URL || 'https://api.openai.com/v1', model: process.env.AI_GATEWAY_MODEL || 'gpt-4o-mini' },
  ].filter(p => p.key);

  for (const provider of providers) {
    try {
      const openai = new OpenAI({ apiKey: provider.key, baseURL: provider.url, timeout: 10000 });
      const completion = await openai.chat.completions.create({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });
      const d = safeJson(completion.choices[0].message.content || '');
      if (Array.isArray(d.slos)) return d.slos;
    } catch (e: any) {
      console.error(`[AI] ${provider.name} failed:`, e.message);
    }
  }

  return [];
}

// ── SLIDING WINDOW EXTRACTOR ───────────────────────────────────────────────────
async function extractSlos(
  text       : string,
  boardKey   : string,
  subjectCode: string,
  domainMap  : Record<string, string>,
  apiKey     : string,
  documentId : string,
  supabase   : any,
  jobId      : string,
  queue      : IngestionQueue
): Promise<any[]> {

  const subjectName = SUBJECTS[subjectCode] || subjectCode;
  const allSlos     : any[] = [];
  const seenFp      = new Set<string>();
  let   chunkIndex  = 0;

  const processedText = linearizeSloText(text);
  const totalLen      = processedText.length;

  const schema = {
    type      : Type.OBJECT,
    properties: {
      slos: {
        type : Type.ARRAY,
        items: {
          type      : Type.OBJECT,
          properties: {
            slo_code          : { type: Type.STRING },
            raw_code_as_found : { type: Type.STRING },
            slo_full_text     : { type: Type.STRING },
            grade             : { type: Type.STRING },
            domain            : { type: Type.STRING },
            domain_name       : { type: Type.STRING },
            subject           : { type: Type.STRING },
          },
          required: ['slo_full_text'],
        },
      },
    },
  };

  const jobStatus  = await queue.getJobStatus(documentId);
  const startI     = jobStatus?.payload?.processedChunks || 0;
  const startOffset = jobStatus?.payload?.processedOffset || 0;

  // FIX-BUG-07: Hydrate seenCodes from DB at start so resumption doesn't re-insert duplicates.
  // Previously this was a fresh in-memory Set that was empty on every cold start/resume.
  const { data: existingCodes } = await supabase
    .from('slo_database')
    .select('slo_code')
    .eq('document_id', documentId)
    .not('slo_code', 'is', null);
  const seenCodes = new Set<string>(
    (existingCodes || []).map((r: any) => r.slo_code).filter(Boolean)
  );
  console.log(`[Extract] Hydrated ${seenCodes.size} existing codes from DB`);

  if (startI === 0 && startOffset === 0 && seenCodes.size === 0) {
    await supabase.from('slo_database').delete().eq('document_id', documentId);
  }

  const rawBlocks = extractRawSloBlocks(processedText);

  if (rawBlocks.length === 0) {
    console.warn('[Extract] Standard regex found 0 blocks. Trying permissive fallback...');
    const fallbackMatches = [...processedText.matchAll(/[A-Z]{1,4}[-\s]*\d{1,2}[-\s]*[A-Z][-\s]*\d{1,3}/gi)]
      .map(m => ({ index: m.index!, raw: m[0] }));

    if (fallbackMatches.length > 0) {
      for (let i = 0; i < fallbackMatches.length; i++) {
        const start = fallbackMatches[i].index;
        const end = fallbackMatches[i + 1]?.index ?? start + 400;
        let block = processedText.substring(start, end).trim();
        if (block.length > 400) block = block.substring(0, 400);
        rawBlocks.push(block.replace(/[\r\n]+/g, ' '));
      }
    }
  }

  // ── PATH A: REGEX BLOCKS FOUND ──
  if (rawBlocks.length > 0) {
    console.log(`[Extract] ${rawBlocks.length} SLO blocks found. Resuming from ${startI}`);

    for (let i = startI; i < rawBlocks.length; i += BATCH_SIZE * CONCURRENCY) {
      const tasks: (() => Promise<{ chunkSlos: any[]; cIndex: number }>)[] = [];

      for (let j = 0; j < CONCURRENCY; j++) {
        const offset = i + (j * BATCH_SIZE);
        if (offset >= rawBlocks.length) break;
        const batch = rawBlocks.slice(offset, offset + BATCH_SIZE).join('\n\n');
        const ci = chunkIndex + j + 1;
        tasks.push(() =>
          callAIOrchestrator(apiKey, batch, schema, subjectName, subjectCode, boardKey, ci)
            .then(chunkSlos => ({ chunkSlos, cIndex: ci }))
            .catch(err => {
              console.error(`[Extract] Chunk ${ci} FAILED:`, err.message);
              return { chunkSlos: [], cIndex: ci };
            })
        );
      }

      await queue.updateProgress(jobId, {
        step: IngestionStep.LINEARIZE,
        progress: Math.round((i / rawBlocks.length) * 50) + 25,
        message: `Formatting SLOs (${i}/${rawBlocks.length})...`,
        processedChunks: i,
      });

      // FIX-BUG-13: throttledAll instead of Promise.all
      const results = await throttledAll(tasks, CONCURRENCY);
      chunkIndex += results.length;

      for (const result of results) {
        if (!result) continue;
        const { chunkSlos, cIndex } = result;
        await persistChunk(chunkSlos, documentId, boardKey, subjectCode, domainMap, seenFp, seenCodes, allSlos, supabase, cIndex, i);
      }
    }
  }

  // ── PATH B: DEEP SCAN (fallback when regex finds nothing) ──
  if (allSlos.length === 0) {
    console.log(`[Extract] 0 SLOs via regex path. Deep Scan from offset ${startOffset}`);
    let offset = startOffset;

    while (offset < totalLen) {
      chunkIndex++;
      let end = Math.min(offset + CHUNK_SIZE, totalLen);
      if (end < totalLen) {
        const zone = processedText.substring(end - 800, end);
        const nl = zone.lastIndexOf('\n');
        if (nl !== -1) end = (end - 800) + nl + 1;
      }

      const chunk = processedText.substring(offset, end);
      await queue.updateProgress(jobId, {
        step: IngestionStep.LINEARIZE,
        progress: Math.round((offset / totalLen) * 50) + 25,
        message: `Deep Scan (Chunk ${chunkIndex}, ${allSlos.length} found)...`,
        processedOffset: offset,
      });

      try {
        const chunkSlos = await callAIOrchestrator(apiKey, chunk, schema, subjectName, subjectCode, boardKey, chunkIndex, true);
        await persistChunk(chunkSlos, documentId, boardKey, subjectCode, domainMap, seenFp, seenCodes, allSlos, supabase, chunkIndex, offset);
      } catch (err: any) {
        console.error(`[Extract] Deep Scan chunk ${chunkIndex} FAILED:`, err.message);
      }

      const rawNext = end - OVERLAP;
      offset = Math.max(offset + MIN_ADVANCE, rawNext);
      if (offset > 1_200_000) {
        console.warn('[Extract] Safety cap at 1.2M chars');
        break;
      }
    }
  }

  return allSlos;
}

// ── PERSIST CHUNK HELPER ───────────────────────────────────────────────────────
async function persistChunk(
  chunkSlos: any[],
  documentId: string,
  boardKey: string,
  subjectCode: string,
  domainMap: Record<string, string>,
  seenFp: Set<string>,
  seenCodes: Set<string>,
  allSlos: any[],
  supabase: any,
  cIndex: number,
  charOffset: number
) {
  const newRecords: any[] = [];

  for (const s of chunkSlos) {
    if (typeof s.slo_full_text !== 'string' || !s.slo_full_text.trim()) continue;

    const fp = createHash('md5').update(`${s.slo_code ?? 'null'}|${s.slo_full_text}`).digest('hex');
    if (seenFp.has(fp)) continue;
    seenFp.add(fp);

    const processed = processSlos([s], boardKey, subjectCode, domainMap)[0];
    if (!processed) continue;

    if (processed.slo_code) {
      if (seenCodes.has(processed.slo_code)) {
        console.warn(`[Extract] Skip duplicate code: ${processed.slo_code}`);
        continue;
      }
      seenCodes.add(processed.slo_code);
    }

    allSlos.push(processed);
    newRecords.push({
      document_id           : documentId,
      slo_code              : processed.slo_code,
      slo_full_text         : processed.slo_full_text,
      domain                : processed.domain,
      domain_name           : processed.domain_name,
      bloom_level           : processed.bloom_level,
      cognitive_complexity  : processed.cognitive_complexity,
      keywords              : processed.keywords,
      subject               : processed.subject,
      grade_level           : processed.grade,
      extraction_confidence : processed.slo_code ? 0.92 : 0.5,
      page_number           : null,
      is_truncated          : processed.is_truncated,
      is_orphan_domain      : processed.is_orphan_domain,
      raw_code_as_found     : processed.raw_code_as_found,
      char_offset           : charOffset,
      benchmark             : processed.benchmark,
      board                 : processed.board,
      teaching_strategies   : processed.teaching_strategies,
      assessment_ideas      : processed.assessment_ideas,
      prerequisite_concepts : processed.prerequisite_concepts,
      common_misconceptions : processed.common_misconceptions,
    });
  }

  if (newRecords.length > 0) {
    const coded    = newRecords.filter(r => r.slo_code != null);
    const codeless = newRecords.filter(r => r.slo_code == null);

    if (coded.length > 0) {
      const { error } = await supabase.from('slo_database').insert(coded);
      if (error) console.error(`[Extract] Coded insert FAILED chunk ${cIndex}:`, error.message);
    }
    if (codeless.length > 0) {
      const { error } = await supabase.from('slo_database').insert(codeless);
      if (error) console.error(`[Extract] Codeless insert FAILED chunk ${cIndex}:`, error.message);
    }
  }

  console.log(`[Extract] Chunk ${cIndex}: +${newRecords.length} new SLOs (total: ${allSlos.length})`);
}

// ── LEDGER JSON BUILDER ────────────────────────────────────────────────────────
function buildLedger(slos: any[], boardKey: string, subjectCode: string): string {
  const boardName   = BOARD_NAMES[boardKey]  || boardKey;
  const subjectName = SUBJECTS[subjectCode] || subjectCode;

  const sorted = [...slos].sort((a, b) => {
    const gA = parseInt(a.grade || '99', 10) || 99;
    const gB = parseInt(b.grade || '99', 10) || 99;
    if (gA !== gB) return gA - gB;
    const dA = (a.domain || 'ZZ').toUpperCase();
    const dB = (b.domain || 'ZZ').toUpperCase();
    if (dA !== dB) return dA.localeCompare(dB);
    return (parseInt((a.slo_code || '').slice(-2), 10) || 0)
         - (parseInt((b.slo_code || '').slice(-2), 10) || 0);
  });

  let md = `# ${boardName} — ${subjectName}\n\n`;

  const grades = [...new Set(sorted.map(s => s.grade || 'Unknown'))];

  for (const grade of grades) {
    md += `## Grade ${grade}\n\n`;
    const gradeSlos = sorted.filter(s => (s.grade || 'Unknown') === grade);
    const domains   = [...new Set(gradeSlos.map(s => s.domain || '?'))];

    for (const domain of domains) {
      const domainSlos = gradeSlos.filter(s => (s.domain || '?') === domain);
      const domainName = domainSlos[0]?.domain_name || 'Domain';
      md += `### Domain ${domain}: ${domainName}\n\n`;
      for (const s of domainSlos) {
        if (typeof s.slo_full_text !== 'string' || !s.slo_full_text.trim()) continue;
        md += `- ${s.slo_code || 'NO_CODE'} — ${s.slo_full_text}\n`;
      }
      md += `\n`;
    }
  }

  const structuredIndex = sorted.map((s, i) => ({
    id           : s.id || createHash('md5').update(`${s.slo_code || i}|${s.slo_full_text}`).digest('hex'),
    document_id  : s.document_id || 'unknown',
    slo_code     : s.slo_code || 'NO_CODE',
    slo_full_text: s.slo_full_text,
    subject      : s.subject || subjectName,
    grade_level  : s.grade || '',
    domain       : s.domain || '',
    domain_name  : s.domain_name || '',
  }));

  md += `<STRUCTURED_INDEX>\n${JSON.stringify(structuredIndex, null, 2)}\n</STRUCTURED_INDEX>`;
  return md;
}

// ── CORE PIPELINE (extracted for after() compatibility) ────────────────────────
async function runIngestionPipeline(
  documentId: string,
  job: any,
  supabase: any,
  queue: IngestionQueue
): Promise<void> {

  // Retry loop for Supabase replication lag
  let doc = null;
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from('documents').select('*').eq('id', documentId).single();
    if (data) { doc = data; break; }
    console.warn(`[Ingestion] Doc not found (attempt ${i + 1}/5). Retrying in 2s...`);
    await new Promise(r => setTimeout(r, 2000));
  }
  if (!doc) throw new Error('VAULT_ERROR: Document not found after 5 attempts (replication lag?)');

  // ══ STAGE 1: EXTRACT ══════════════════════════════════════════════════════
  if (job.step === IngestionStep.EXTRACT) {
    await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching PDF...' });

    let text = doc.extracted_text || '';

    if (!text || text.length < 200) {
      const r2Path = doc.file_path;
      if (!r2Path) throw new Error('R2_FAULT: No file_path and no pre-extracted text');
      const buffer = await getObjectBuffer(r2Path);
      if (!buffer) throw new Error('R2_FAULT: File unreachable from R2');

      const result = await pdf(buffer);
      text = result.text?.trim() || '';

      // FIX-BUG-14: Scanned PDF detection with human-readable error
      if (text.length < 200) {
        const isScanned = result.numpages > 0 && text.length < 50 * result.numpages;
        throw new Error(
          isScanned
            ? `SCANNED_PDF: This appears to be a scanned image PDF (${result.numpages} pages, ${text.length} chars). ` +
              `Please convert it to a searchable PDF using Adobe Acrobat, Google Drive (right-click → Open with Docs), ` +
              `or an OCR tool (tesseract) before uploading.`
            : `PDF_TOO_SHORT: Only ${text.length} chars from ${result.numpages} pages. ` +
              `The PDF may be empty, password-protected, or use unsupported font encoding.`
        );
      }
    }

    const sample  = `${doc.name || ''} ${text.substring(0, 2000)}`;
    const board   = detectBoard(sample);
    const subject = detectSubject(sample);

    await supabase.from('documents').update({
      extracted_text  : text,
      document_summary: `raw|board:${board}|subject:${subject}|len:${text.length}`,
      status          : 'processing',
    }).eq('id', documentId);

    await queue.updateProgress(job.id, { step: IngestionStep.LINEARIZE, progress: 25, message: 'Extracting SLOs...' });
    job = await queue.getJobStatus(documentId);
  }

  // ══ STAGE 2: LINEARIZE ════════════════════════════════════════════════════
  if (job.step === IngestionStep.LINEARIZE) {
    const { data: cur } = await supabase.from('documents')
      .select('extracted_text, document_summary').eq('id', documentId).single();

    const rawText = cur?.extracted_text || '';
    const meta    = cur?.document_summary || '';
    const board   = meta.match(/board:(\w+)/)?.[1]      || 'SINDH';
    const subject = meta.match(/subject:([A-Z]+)/)?.[1] || 'B';

    if (!rawText || rawText.length < 200) {
      throw new Error(`STAGE2_FAULT: extracted_text empty (${rawText.length} chars). Summary: "${meta}"`);
    }

    let skipExtraction = false;
    const isLedgerText = rawText.startsWith('# ') || rawText.startsWith('Board:') ||
                         rawText.startsWith('{') || rawText.trim().startsWith('{');

    if (isLedgerText) {
      const { count } = await supabase.from('slo_database')
        .select('*', { count: 'exact', head: true }).eq('document_id', documentId);
      if (count && count > 0) {
        console.log(`[Stage 2] Already a ledger with ${count} SLOs — skipping`);
        skipExtraction = true;
      }
    }

    if (!skipExtraction) {
      // FIX-BUG-02: Server-only API key resolution (no NEXT_PUBLIC_)
      const apiKey =
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.API_KEY ||
        '';

      if (!apiKey) {
        throw new Error(
          'API_KEY_MISSING: Set GEMINI_API_KEY in server environment.\n' +
          'IMPORTANT: Do NOT use NEXT_PUBLIC_GEMINI_API_KEY — it exposes your key in the browser bundle.'
        );
      }

      const domainMap = scanDomains(rawText);
      const slos = await extractSlos(rawText, board, subject, domainMap, apiKey, documentId, supabase, job.id, queue);

      if (slos.length === 0) {
        const regexCount = extractRawSloBlocks(rawText).length;
        await supabase.from('documents').update({
          status: 'failed',
          document_summary: `slo_extraction_failed|regex:${regexCount}|len:${rawText.length}|board:${board}|subject:${subject}`,
        }).eq('id', documentId);
        await queue.markFailed(job.id, `SLO extraction failed. 0 SLOs found (regex blocks: ${regexCount}).`);
        return;
      }

      const { data: allDbSlos } = await supabase.from('slo_database').select('*').eq('document_id', documentId);
      const fullList = allDbSlos?.length > 0 ? allDbSlos : slos;
      const ledger   = buildLedger(fullList, board, subject);

      await supabase.from('documents').update({
        extracted_text  : ledger,
        document_summary: `ledger|slos:${fullList.length}|board:${board}|subject:${subject}`,
      }).eq('id', documentId);
    }

    await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 75, message: 'Building RAG index...' });
    job = await queue.getJobStatus(documentId);
  }

  // ══ STAGE 3: ENRICH (skipped) ═════════════════════════════════════════════
  if (job.step === IngestionStep.ENRICH) {
    await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 75, message: 'Building RAG index...' });
    job = await queue.getJobStatus(documentId);
  }

  // ══ STAGE 4: EMBED ════════════════════════════════════════════════════════
  if (job.step === IngestionStep.EMBED) {
    const { data: fin } = await supabase.from('documents')
      .select('extracted_text').eq('id', documentId).single();

    const txt = fin?.extracted_text || '';
    if (txt.length >= 100) {
      await indexDocumentForRAG(documentId, txt, supabase, job.id);
    } else {
      console.warn(`[Stage 4] Text too short (${txt.length}) — skipping RAG`);
    }

    await queue.markComplete(job.id);

    const { error: updateErr } = await supabase.from('documents').update({
      status          : 'ready',
      rag_indexed     : true,
      document_summary: txt.startsWith('# ') ? txt.split('\n').slice(0, 4).join(' | ') : 'indexed',
    }).eq('id', documentId);

    if (updateErr) console.error('[Stage 4] FAILED to set status=ready:', updateErr);
    else console.log('[Stage 4] Document status → ready ✓');
  }
}

// ── ROUTE HANDLER ──────────────────────────────────────────────────────────────
export async function POST(
  req  : NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const supabase = getSupabaseAdminClient();
  const queue    = new IngestionQueue(supabase);

  let job = await queue.getJobStatus(documentId).catch(() => null);

  if (!job) {
    // Brand new — create first job
    const id = await queue.enqueue(documentId);
    job = { id, step: IngestionStep.EXTRACT };

  } else if (job.status === 'complete') {
    // FIX-BUG-03: getJobStatus now returns complete jobs; detect them here
    return NextResponse.json({ success: true, done: true, step: 'COMPLETE', progress: 100 });

  } else if (job.status === 'failed') {
    // Allow retry — reset to EXTRACT
    await supabase.from('ingestion_jobs').update({
      status: 'pending',
      step: IngestionStep.EXTRACT,
      error_message: null,
      payload: null,
    }).eq('id', job.id);
    job.step   = IngestionStep.EXTRACT;
    job.status = 'pending';

  } else if (job.status === 'processing' && job.updated_at) {
    const age = Date.now() - new Date(job.updated_at).getTime();
    if (age < 60_000) {
      console.log(`[Ingestion] Job active (${Math.round(age / 1000)}s ago). Skipping.`);
      return NextResponse.json({ success: true, message: 'Already processing' });
    }
    // Stale job — reset to pending but keep step for resumption
    console.log(`[Ingestion] Stale job (${Math.round(age / 1000)}s). Resuming from step ${job.step}...`);
    await supabase.from('ingestion_jobs').update({ status: 'pending' }).eq('id', job.id);

  } else if (job.status === 'pending') {
    await supabase.from('ingestion_jobs').update({ status: 'processing' }).eq('id', job.id);
    if (!job.step) job.step = IngestionStep.EXTRACT;
  }

  const capturedJob = { ...job };

  // FIX-BUG-04: Use unstable_after so Vercel doesn't kill the background task on response flush.
  // Previously used (async () => {})() which dies immediately after NextResponse is returned.
  after(async () => {
    try {
      await runIngestionPipeline(documentId, capturedJob, supabase, queue);
    } catch (err: any) {
      const msg = String(err.message || err).substring(0, 500);
      console.error(`[Ingestion] FATAL doc=${documentId}:`, msg);
      try { await queue.markFailed(capturedJob.id, msg); } catch (_) {}
      try {
        await supabase.from('documents')
          .update({ status: 'failed', document_summary: msg })
          .eq('id', documentId);
      } catch (_) {}
    }
  });

  return NextResponse.json({ success: true });
}
