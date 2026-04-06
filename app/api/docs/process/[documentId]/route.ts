// app/api/docs/process/[documentId]/route.ts
// PEDAGOGY MASTER AI — Ingestion Engine v6.3
// FIXES: Math (M) curriculum support — horizontal SLO table, grades I-VIII, OCR in grade position

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep } from '../../../../../types';
import { IngestionQueue } from '../../../../../lib/jobs/ingestion-queue';
import pdf from 'pdf-parse';
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from 'openai';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ── CONFIG ────────────────────────────────────────────────────────────────────
const MODEL_PRIMARY  = 'gemini-3-flash-preview';
const MODEL_FALLBACK = 'gemini-3-flash-preview';

const CHUNK_SIZE  = 10000;
const OVERLAP     = 2500;
const MIN_ADVANCE = 5000;

// ── LOOKUP TABLES ─────────────────────────────────────────────────────────────
const ROMAN: Record<string, string> = {
  I:'01', II:'02', III:'03', IV:'04', V:'05', VI:'06',
  VII:'07', VIII:'08', IX:'09', X:'10', XI:'11', XII:'12',
};

// Which subjects use grades I-VIII (01-08) vs IX-XII (09-12)
const PRIMARY_SUBJECTS = new Set(['M', 'S', 'E', 'U']); // Math, Gen Science, English, Urdu (Grades I-VIII)

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

// ── DETECTION ─────────────────────────────────────────────────────────────────
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

// ── SLO CODE NORMALIZER ───────────────────────────────────────────────────────
// Handles every variant found across all Sindh Board curricula:
//   Math:     [SLO:M-01-A-0l] → M01A01   grades I-VIII (01-08)
//   Science:  [SLO:C-09-A-02] → C09A02   grades IX-XII (09-12)
//   OCR:      0l or 0I in any position → 01
//   SW prefix, SL0/5L0 typos, grade range codes, unpadded grades
function normalizeCode(raw: any): string | null {
  if (!raw || raw === 'null') return null;
  if (typeof raw !== 'string') raw = String(raw);

  let s = raw.toUpperCase()
    .replace(/^\[?(?:5L0|SL[O0]|LO|SW)\s*[:\s]*/i, '')
    .replace(/[\[\]():]/g, '')
    .replace(/[.\s]/g, '')
    .trim();

  // Grade-range codes: M-01-02-A-01 (appears in cross-grade benchmarks) → take first grade
  const gradeRange = s.match(/^([A-Z]{1,4})-?(\d{2})-(\d{2})-?([A-Z])-?(\d{1,3})$/);
  if (gradeRange) {
    return `${gradeRange[1]}${gradeRange[2]}${gradeRange[4]}${gradeRange[5].padStart(2, '0')}`;
  }

  s = s.replace(/-/g, ''); // remove all dashes

  // ── OCR fixes (applied before matching) ──────────────────────────────────
  // Fix 0l / 0L / 0I in GRADE position (between subject code and domain letter)
  // e.g. M0LA09 → M01A09,  C0LA03 → C01A03
  s = s.replace(/([A-Z]{1,4})0[LlIi]([A-Z])/, '$101$2');

  // Fix 0l / 0L / 0I at END of string (SLO number position)
  s = s.replace(/0[LlIi]$/i, '01');

  // Fix trailing l or I (SLO number)
  s = s.replace(/[lI]$/i, '1');

  // Fix O in digit positions (e.g. AO1 → A01)
  s = s.replace(/([A-Z])O(\d)/, '$10$2');
  s = s.replace(/(\d)O([A-Z\d])/, '$10$2');

  // Roman numeral grade embedded in code: MVIIIA01 → M08A01
  const romMatch = s.match(/^([A-Z]{1,4})(XII|XI|IX|X|VIII|VII|VI|V|IV|III|II)([A-Z])(\d{1,3})$/);
  if (romMatch) {
    return `${romMatch[1]}${ROMAN[romMatch[2]] ?? romMatch[2]}${romMatch[3]}${romMatch[4].padStart(2, '0')}`;
  }

  // Standard pattern: M01A01 or C09A01
  const numMatch = s.match(/^([A-Z]{1,4})(\d{1,2})([A-Z])(\d{1,3})$/);
  if (numMatch) {
    const sloNum = numMatch[4].startsWith('00') ? numMatch[4].slice(-2) : numMatch[4].padStart(2, '0');
    return `${numMatch[1]}${numMatch[2].padStart(2, '0')}${numMatch[3]}${sloNum}`;
  }

  return null;
}

// ── SLO TABLE LINEARIZER ─────────────────────────────────────────────────────
// Some curricula store SLOs in horizontal tables (one column per grade).
// pdf-parse reads left-to-right, producing chunks like:
//   [SLO:B-09-A-01] [SLO:B-10-A-01] [SLO:B-11-A-01]
//   Explain cell    Explain tissue   Explain organ
//
// This function scans for all SLO codes and attaches the text block that follows
// the LAST code in each row to all codes in that row.
function linearizeSloText(text: string): string {
  // Match any SLO code variant (M, B, C, P, E, S, etc.)
  // Patterns like [SLO: B-09-A-01] or SLO: B-09-A-01 or (SLO: B-09-A-01)
  const codeRe = /(?:\[?\s*(?:(?:5L0|SL[O0]|LO|SW|SLO)\s*[:\s]+)?([A-Z]{1,4})\s*[-\s]*\d{1,2}\s*[-\s]*[A-Z]\s*[-\s]*\d{1,2}[lI0-9]*\s*\]?)/gi;

  const matches: { start: number; end: number; raw: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(text)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, raw: m[0] });
  }

  if (matches.length === 0) return text;

  // Group codes that appear on the same line (within 250 chars and no newline)
  type Group = { codes: string[]; start: number; end: number };
  const groups: Group[] = [];
  let i = 0;
  while (i < matches.length) {
    const group: Group = { 
      codes: [matches[i].raw], 
      start: matches[i].start, 
      end: matches[i].end 
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

  let result = "";
  let lastPos = 0;

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    
    // Add text before this group (preserving headers, etc.)
    result += text.slice(lastPos, group.start);
    
    // Determine where the text for this group ends (start of next group or end of text)
    let nextGroupStart = text.length;
    if (g + 1 < groups.length) {
      nextGroupStart = groups[g + 1].start;
    }
    
    // Safety: don't take more than 1500 chars for a group text to avoid massive duplication
    const groupTextEnd = Math.min(nextGroupStart, group.end + 1500);
    const groupText = text.slice(group.end, groupTextEnd);
    
    // Linearize: for each code in the group, append the text block
    // This helps the AI see "Code: Text" even if the PDF was read left-to-right
    for (const code of group.codes) {
      result += `\n${code} ${groupText.replace(/[\r\n\t ]+/g, ' ').trim()}\n`;
    }
    
    lastPos = nextGroupStart;
  }
  
  // Add any remaining text after the last group
  result += text.slice(lastPos);

  return result;
}

// ── DOMAIN SCANNER ────────────────────────────────────────────────────────────
function scanDomains(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /DOMAIN\s+([A-Z])\s*[:\-]\s*([^\n\r]{5,80})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const l = m[1].toUpperCase();
    if (!map[l]) map[l] = m[2].trim().replace(/\s+/g, ' ');
  }
  return map;
}

// ── SAFE JSON PARSER ──────────────────────────────────────────────────────────
function safeJson(raw: any): any {
  if (typeof raw !== 'string') {
    if (raw && typeof raw === 'object') return raw;
    raw = String(raw || '');
  }
  if (!raw?.trim()) return { slos: [] };
  
  // Try to find <STRUCTURED_INDEX> block first
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

  // Remove markdown code blocks
  let c = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  
  // Handle "Board:" prefix if it's a legacy ledger format
  if (c.startsWith('Board:')) {
    const jsonMatch = c.match(/\{[\s\S]*\}/);
    if (jsonMatch) c = jsonMatch[0];
  } else if (!c.startsWith('{') && !c.startsWith('[') && (c.includes('{') || c.includes('['))) {
     // Sometimes the text has garbage before the JSON starts
     const jsonMatch = c.match(/[\{\[][\s\S]*[\}\]]/);
     if (jsonMatch) c = jsonMatch[0];
  }

  try { 
    const parsed = JSON.parse(c);
    if (Array.isArray(parsed)) return { slos: parsed };
    return parsed;
  } catch {/* */}
  
  // Try to find the first { and last }
  const first = c.indexOf('{');
  const last = c.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try { return JSON.parse(c.substring(first, last + 1)); } catch {/* */}
  }

  console.error('[safeJson] FAILED to parse:', c.substring(0, 200));
  return { slos: [] };
}

// ── DEDUPLICATION ─────────────────────────────────────────────────────────────
function dedupe(records: any[]): any[] {
  const seen = new Map<string, number>();
  return records.map(r => {
    const key = r.slo_code != null
      ? `${r.document_id}:${r.slo_code}`
      : `${r.document_id}:NULL:${(r.slo_full_text || '').substring(0, 80)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n === 0) return r;
    if (r.slo_code != null) return { ...r, slo_code: `${r.slo_code}_v${n + 1}` };
    return null;
  }).filter(Boolean);
}

// ── PROCESS RAW SLOs ──────────────────────────────────────────────────────────
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
      slo_code          : code,
      raw_code_as_found : s.slo_code || 'null',
      slo_full_text     : typeof s.slo_full_text === 'string' ? s.slo_full_text.trim() : '',
      grade,
      domain,
      domain_name       : dname,
      bloom_level       : s.bloom_level || null,
      cognitive_complexity: s.cognitive_complexity || null,
      keywords          : Array.isArray(s.keywords) ? s.keywords : [],
      benchmark         : s.benchmark || null,
      subject           : SUBJECTS[subjectCode] || subjectCode,
      subject_code      : subjectCode,
      board             : boardKey,
      is_truncated      : Boolean(s.is_truncated),
      is_orphan_domain  : !domain,
      regex_confidence  : code ? 1.0 : 0.5,
      teaching_strategies: Array.isArray(s.teaching_strategies) ? s.teaching_strategies : [],
      assessment_ideas   : Array.isArray(s.assessment_ideas) ? s.assessment_ideas : [],
      prerequisite_concepts: Array.isArray(s.prerequisite_concepts) ? s.prerequisite_concepts : [],
      common_misconceptions: Array.isArray(s.common_misconceptions) ? s.common_misconceptions : [],
    });
  }
  return processed;
}

function extractRawSloBlocks(text: string): string[] {
  const codeRe = /(?:\[?\s*(?:(?:5L0|SL[O0]|LO|SW|SLO)\s*[:\s]+)?([A-Z]{1,4})\s*[-\s]*\d{1,2}\s*[-\s]*[A-Z]\s*[-\s]*\d{1,2}[lI0-9]*\s*\]?)/gi;
  const matches = [];
  let m;
  while ((m = codeRe.exec(text)) !== null) {
    matches.push({ index: m.index, raw: m[0] });
  }
  
  const blocks = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    const start = current.index;
    const end = next ? next.index : start + 400;
    let block = text.substring(start, end).trim();
    if (block.length > 400) block = block.substring(0, 400);
    blocks.push(block.replace(/[\r\n]+/g, ' '));
  }
  return blocks;
}

// ── EXTRACTION PROMPT (RALPH v3.0 - PEDAGOGY MASTER EDITION) ──────────────────
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
${isDeep ? '- Scan the text and extract ANY Student Learning Outcomes (SLOs) you find. Ignore junk text, table of contents, and introductions. FOCUS ONLY ON SLO CODES AND DESCRIPTIONS.' : '- You are receiving pre-filtered text that ONLY contains SLO codes and their descriptions.'}
- Format each block into a valid JSON object.
- Fix any OCR typos in the text.
- Return ONLY raw JSON.

=== RAW TEXT ===
${chunk}`;
}

// ── AI ORCHESTRATOR (Grok, Mistral, OpenAI, Gemini, etc.) ──────────────────────────
async function callAIOrchestrator(apiKey: string, text: string, schema: any, subject: string, subjectCode: string, board: string, chunkN: number, isDeep: boolean = false, retries: number = 2): Promise<any[]> {
  const prompt = makePrompt(text, subject, subjectCode, board, chunkN, isDeep);

  // ORCHESTRATION: Build a list of available providers from Vercel Env Vars
  const providers = [
    { name: 'AI Gateway', key: process.env.AI_GATEWAY_API_KEY, url: process.env.AI_GATEWAY_URL || 'https://api.openai.com/v1', model: process.env.AI_GATEWAY_MODEL || 'gpt-4o-mini' },
    { name: 'Groq', key: process.env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1', model: 'llama-3.1-8b-instant' },
    { name: 'Cerebras', key: process.env.CEREBRAS_API_KEY, url: 'https://api.cerebras.ai/v1', model: 'llama3.1-8b' },
    { name: 'SambaNova', key: process.env.SAMBANOVA_API_KEY, url: 'https://api.sambanova.ai/v1', model: 'Meta-Llama-3.1-8B-Instruct' },
    { name: 'Mistral', key: process.env.API_MISTRAL, url: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
    { name: 'DeepSeek', key: process.env.DEEPSEEK_API_KEY, url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { name: 'OpenRouter', key: process.env.OPENROUTER_API_KEY, url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' }
  ].filter(p => p.key);

  // Try each available provider in sequence
  for (const provider of providers) {
    try {
      console.log(`[AI Orchestrator] Routing to ${provider.name} (${provider.model})...`);
      const openai = new OpenAI({ apiKey: provider.key, baseURL: provider.url, timeout: 15000 });
      const completion = await openai.chat.completions.create({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      });
      const d = safeJson(completion.choices[0].message.content || '');
      if (Array.isArray(d.slos) && d.slos.length > 0) {
        console.log(`[AI Orchestrator] ${provider.name} success: ${d.slos.length} SLOs found.`);
        return d.slos;
      }
    } catch (e: any) {
      console.error(`[AI Orchestrator] ${provider.name} routing failed:`, e.message);
      // Continue to the next provider in the loop
    }
  }

  // FALLBACK TO GEMINI
  if (!apiKey) return [];
  const ai = new GoogleGenAI({ apiKey });
  
  const cfg = {
    responseMimeType: 'application/json' as const,
    responseSchema  : schema,
    maxOutputTokens : 8192,
    temperature     : 0.1,
  };

  try {
    console.log(`[AI Orchestrator] Calling Gemini ${MODEL_PRIMARY} (Attempt ${3 - retries})...`);
    const r = await ai.models.generateContent({
      model   : MODEL_PRIMARY,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config  : cfg,
    });
    const d = safeJson(r.text || '');
    if (Array.isArray(d.slos) && d.slos.length > 0) {
      console.log(`[AI Orchestrator] ${MODEL_PRIMARY} success: ${d.slos.length} SLOs found.`);
      return d.slos;
    }
  } catch (e: any) {
    const isQuota = /429|quota|RESOURCE_EXHAUSTED/i.test(e.message || '');
    const isTokenLimit = /limit|token|exceeded/i.test(e.message || '');
    
    if (isTokenLimit) {
      console.error(`[AI Orchestrator] Token limit exceeded for chunk ${chunkN}. Returning partial results.`);
      return [];
    } else if (isQuota) {
      console.warn(`[AI Orchestrator] ${MODEL_PRIMARY} quota exceeded.`);
      if (retries > 0) {
        console.log(`[AI Orchestrator] Waiting 10s before retry...`);
        await new Promise(r => setTimeout(r, 10000));
        return await callAIOrchestrator(apiKey, text, schema, subject, subjectCode, board, chunkN, isDeep, retries - 1);
      }
    } else {
      console.error(`[AI Orchestrator] ${MODEL_PRIMARY} error:`, e.message);
    }
  }

  // FALLBACK: LAST RESORT
  console.log(`[AI Orchestrator] Trying last resort fallback: ${MODEL_FALLBACK}`);
  try {
    const rFallback = await ai.models.generateContent({
      model   : MODEL_FALLBACK,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config  : { ...cfg, maxOutputTokens: 8192 },
    });
    const dFallback = safeJson(rFallback.text || '');
    console.log(`[AI Orchestrator] Fallback result: ${dFallback.slos?.length || 0} SLOs found.`);
    return dFallback.slos || [];
  } catch (e: any) {
    console.error(`[AI Orchestrator] Fallback failed:`, e.message);
    if (/429|quota/i.test(e.message) && retries > 0) {
        console.log(`[AI Orchestrator] Fallback quota exceeded. Waiting 10s...`);
        await new Promise(r => setTimeout(r, 10000));
        return await callAIOrchestrator(apiKey, text, schema, subject, subjectCode, board, chunkN, isDeep, retries - 1);
    }
    return [];
  }
}

// ── SLIDING WINDOW EXTRACTOR ──────────────────────────────────────────────────
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
  const isPrimary   = PRIMARY_SUBJECTS.has(subjectCode);
  const allSlos     : any[] = [];
  const seenFp      = new Set<string>();
  let   chunkIndex  = 0;

  const processedText = linearizeSloText(text);
  const totalLen      = processedText.length;
  console.log(`[Extract] rawLen=${text.length} processedLen=${totalLen}`);

  const schema = {
    type      : Type.OBJECT,
    properties: {
      slos: {
        type : Type.ARRAY,
        items: {
          type      : Type.OBJECT,
          properties: {
            slo_code            : { type: Type.STRING  },
            raw_code_as_found   : { type: Type.STRING  },
            slo_full_text       : { type: Type.STRING  },
            grade               : { type: Type.STRING  },
            domain              : { type: Type.STRING  },
            domain_name         : { type: Type.STRING  },
            subject             : { type: Type.STRING  }
          },
          required: ['slo_full_text'],
        },
      },
    },
  };

  const jobStatus = await queue.getJobStatus(documentId);
  const startI = jobStatus?.payload?.processedChunks || 0;
  const startOffset = jobStatus?.payload?.processedOffset || 0;

  if (startI === 0 && startOffset === 0) {
    // Only clear if starting fresh
    await supabase.from('slo_database').delete().eq('document_id', documentId);
  }

  const rawBlocks = extractRawSloBlocks(processedText);

  if (rawBlocks.length === 0) {
    console.warn('[Extract] Regex found 0 blocks with standard pattern. Trying ultra-permissive fallback...');
    // Ultra permissive: matches anything that looks like [A-Z]-09-A-01 or similar
    const fallbackRe = /[A-Z]{1,4}[-\s]*\d{1,2}[-\s]*[A-Z][-\s]*\d{1,3}/gi;
    let m;
    const fallbackMatches = [];
    while ((m = fallbackRe.exec(processedText)) !== null) {
      fallbackMatches.push({ index: m.index, raw: m[0] });
    }
    
    if (fallbackMatches.length > 0) {
      console.log(`[Extract] Fallback regex found ${fallbackMatches.length} potential blocks.`);
      for (let i = 0; i < fallbackMatches.length; i++) {
        const current = fallbackMatches[i];
        const next = fallbackMatches[i + 1];
        const start = current.index;
        const end = next ? next.index : start + 400;
        let block = processedText.substring(start, end).trim();
        if (block.length > 400) block = block.substring(0, 400);
        rawBlocks.push(block.replace(/[\r\n]+/g, ' '));
      }
    }
  }

  if (rawBlocks.length > 0) {
    console.log(`[Extract] Regex found ${rawBlocks.length} SLO blocks. Bypassing junk text! Resuming from ${startI}`);
    const BATCH_SIZE = 40;
    const CONCURRENCY = 3;
    
    for (let i = startI; i < rawBlocks.length; i += BATCH_SIZE * CONCURRENCY) {
      const promises = [];
      for (let j = 0; j < CONCURRENCY; j++) {
        const offset = i + (j * BATCH_SIZE);
        if (offset >= rawBlocks.length) break;
        
        const batch = rawBlocks.slice(offset, offset + BATCH_SIZE).join('\n\n');
        promises.push(
          callAIOrchestrator(apiKey, batch, schema, subjectName, subjectCode, boardKey, chunkIndex + j + 1)
            .then(chunkSlos => ({ offset, chunkSlos, cIndex: chunkIndex + j + 1 }))
            .catch(err => {
              console.error(`[Extract] Chunk ${chunkIndex + j + 1} FAILED:`, err.message);
              return { offset, chunkSlos: [], cIndex: chunkIndex + j + 1 };
            })
        );
      }
      
      const progress = Math.round((i / rawBlocks.length) * 50) + 25; // 25% to 75%
      await queue.updateProgress(jobId, {
        step: IngestionStep.LINEARIZE,
        progress,
        message: `Formatting SLOs (${i}/${rawBlocks.length})...`,
        processedChunks: i
      });

      const results = await Promise.all(promises);
      chunkIndex += results.length;

      for (const { chunkSlos, cIndex } of results) {
        const newRecords: any[] = [];
        for (const s of chunkSlos) {
          if (typeof s.slo_full_text !== 'string' || !s.slo_full_text.trim()) continue;
          
          const fp = createHash('md5').update(`${s.slo_code ?? 'null'}|${s.slo_full_text}`).digest('hex');
          if (seenFp.has(fp)) continue;
          seenFp.add(fp);
          
          const processed = processSlos([s], boardKey, subjectCode, domainMap)[0];
          if (!processed) continue;

          allSlos.push(processed);
          newRecords.push({
            document_id          : documentId,
            slo_code             : processed.slo_code,
            slo_full_text        : processed.slo_full_text,
            domain               : processed.domain,
            domain_name          : processed.domain_name,
            bloom_level          : processed.bloom_level,
            cognitive_complexity : processed.cognitive_complexity,
            keywords             : processed.keywords,
            subject              : processed.subject,
            grade_level          : processed.grade,
            extraction_confidence: processed.slo_code ? 0.92 : 0.5,
            page_number          : null,
            is_truncated         : processed.is_truncated,
            is_orphan_domain     : processed.is_orphan_domain,
            raw_code_as_found    : processed.raw_code_as_found,
            char_offset          : i, // Using base i for simplicity
            benchmark            : processed.benchmark,
            board                : processed.board,
            teaching_strategies  : processed.teaching_strategies,
            assessment_ideas     : processed.assessment_ideas,
            prerequisite_concepts: processed.prerequisite_concepts,
            common_misconceptions: processed.common_misconceptions,
          });
        }

        if (newRecords.length > 0) {
          const coded    = newRecords.filter(r => r.slo_code != null);
          const codeless = newRecords.filter(r => r.slo_code == null);
          
          if (coded.length > 0) {
            await supabase.from('slo_database').insert(coded);
          }
          if (codeless.length > 0) {
            await supabase.from('slo_database').insert(codeless);
          }
        }
        console.log(`[Extract] Chunk ${cIndex}: +${newRecords.length} new SLOs (${allSlos.length} total)`);
      }
    }
  } else {
    console.log(`[Extract] No codes found via Regex. Falling back to Deep Scan sliding window... Resuming from offset ${startOffset}`);
    let offset = startOffset;
    while (offset < totalLen) {
      chunkIndex++;

      let end = Math.min(offset + CHUNK_SIZE, totalLen);
      if (end < totalLen) {
        const zone = processedText.substring(end - 800, end);
        const nl   = zone.lastIndexOf('\n');
        if (nl !== -1) end = (end - 800) + nl + 1;
      }

      const chunk = processedText.substring(offset, end);
      const progress = Math.round((offset / totalLen) * 50) + 25; // 25% to 75%
      
      await queue.updateProgress(jobId, {
        step: IngestionStep.LINEARIZE,
        progress,
        message: `Extracting SLOs (Chunk ${chunkIndex}, ${allSlos.length} found)...`,
        processedOffset: offset
      });

      try {
        const chunkSlos = await callAIOrchestrator(apiKey, chunk, schema, subjectName, subjectCode, boardKey, chunkIndex, true);

        const newRecords: any[] = [];
        for (const s of chunkSlos) {
          if (typeof s.slo_full_text !== 'string' || !s.slo_full_text.trim()) continue;
          
          const fp = createHash('md5').update(`${s.slo_code ?? 'null'}|${s.slo_full_text}`).digest('hex');
          if (seenFp.has(fp)) continue;
          seenFp.add(fp);
          
          const processed = processSlos([s], boardKey, subjectCode, domainMap)[0];
          if (!processed) continue;

          allSlos.push(processed);
          newRecords.push({
            document_id          : documentId,
            slo_code             : processed.slo_code,
            slo_full_text        : processed.slo_full_text,
            domain               : processed.domain,
            domain_name          : processed.domain_name,
            bloom_level          : processed.bloom_level,
            cognitive_complexity : processed.cognitive_complexity,
            keywords             : processed.keywords,
            subject              : processed.subject,
            grade_level          : processed.grade,
            extraction_confidence: processed.slo_code ? 0.92 : 0.5,
            page_number          : null,
            is_truncated         : processed.is_truncated,
            is_orphan_domain     : processed.is_orphan_domain,
            raw_code_as_found    : processed.raw_code_as_found,
            char_offset          : offset,
            benchmark            : processed.benchmark,
            board                : processed.board,
            teaching_strategies  : processed.teaching_strategies,
            assessment_ideas     : processed.assessment_ideas,
            prerequisite_concepts: processed.prerequisite_concepts,
            common_misconceptions: processed.common_misconceptions,
          });
        }

        if (newRecords.length > 0) {
          const coded    = newRecords.filter(r => r.slo_code != null);
          const codeless = newRecords.filter(r => r.slo_code == null);
          
          if (coded.length > 0) {
            await supabase.from('slo_database').insert(coded);
          }
          if (codeless.length > 0) {
            await supabase.from('slo_database').insert(codeless);
          }
        }
        console.log(`[Extract] Chunk ${chunkIndex}: +${newRecords.length} new SLOs (${allSlos.length} total)`);
      } catch (err: any) {
        console.error(`[Extract] Chunk ${chunkIndex} FAILED:`, err.message);
      }

      const rawNext = end - OVERLAP;
      offset        = Math.max(offset + MIN_ADVANCE, rawNext);
      if (offset > 1200_000) {
        console.warn('[Extract] Safety cap at 1.2M chars');
        break;
      }
    }
  }

  return allSlos;
}

// ── LEDGER JSON BUILDER ───────────────────────────────────────────────────────
function buildLedger(slos: any[], boardKey: string, subjectCode: string): string {
  const boardName = BOARD_NAMES[boardKey] || boardKey;
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
    const domains = [...new Set(gradeSlos.map(s => s.domain || '?'))];

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
    id: s.id || createHash('md5').update(`${s.slo_code || i}|${s.slo_full_text}`).digest('hex'),
    document_id: s.document_id || 'unknown',
    slo_code: s.slo_code || 'NO_CODE',
    slo_full_text: s.slo_full_text,
    subject: s.subject || subjectName,
    grade_level: s.grade || '',
    domain: s.domain || '',
    domain_name: s.domain_name || ''
  }));

  md += `<STRUCTURED_INDEX>\n${JSON.stringify(structuredIndex, null, 2)}\n</STRUCTURED_INDEX>`;

  return md;
}

// ── ROUTE HANDLER ─────────────────────────────────────────────────────────────
export async function POST(
  req  : NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const supabase = getSupabaseAdminClient();
  const queue    = new IngestionQueue(supabase);

  let job = await queue.getJobStatus(documentId).catch(() => null);

  if (!job) {
    const id = await queue.enqueue(documentId);
    job = { id, step: IngestionStep.EXTRACT };
  } else if (job.status === 'complete' || job.step === IngestionStep.COMPLETE) {
    return NextResponse.json({ success: true, done: true, step: 'COMPLETE', progress: 100 });
  } else if (job.status === 'processing' && job.updated_at) {
    const lastUpdate = new Date(job.updated_at).getTime();
    if (Date.now() - lastUpdate < 300000) { // 5 minutes
      console.log(`[Ingestion] Job is actively processing (updated ${Math.round((Date.now() - lastUpdate)/1000)}s ago). Ignoring duplicate trigger.`);
      return NextResponse.json({ success: true, message: 'Already processing' });
    }
    // Stale 'processing' job — reset status but keep step and payload to resume
    console.log(`[Ingestion] Stale job detected. Resuming from step ${job.step}...`);
    await supabase.from('ingestion_jobs')
      .update({ status: 'pending' })
      .eq('id', job.id);
    // Keep job.step as is
  } else if (job.status === 'pending') {
    // Job exists but never started or was reset — proceed with current step
    await supabase.from('ingestion_jobs')
      .update({ status: 'processing', message: null })
      .eq('id', job.id);
    // Do not reset step to EXTRACT if it's already LINEARIZE or EMBED
    if (!job.step) job.step = IngestionStep.EXTRACT;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Ingestion] START doc=${documentId} step=${job.step}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const { data: doc } = await supabase
      .from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error('VAULT_ERROR: Document not found');

    // ════════════════════════════════════════════════════════
    // STAGE 1 — EXTRACT (pdf-parse → raw text)
    // ════════════════════════════════════════════════════════
    if (job.step === IngestionStep.EXTRACT) {
      await queue.updateProgress(job.id, {
        step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching PDF...',
      });

      let text = doc.extracted_text || '';
      
      if (!text || text.length < 200) {
        console.log('[Stage 1] No pre-extracted text found. Falling back to server-side parsing...');
        const r2Path = doc.file_path;
        if (!r2Path) throw new Error('R2_FAULT: No file_path on document and no pre-extracted text');

        try {
          const buffer = await getObjectBuffer(r2Path);
          if (!buffer)  throw new Error('R2_FAULT: File unreachable from R2');

          const result = await pdf(buffer);
          text = result.text?.trim() || '';
          console.log(`[Stage 1] PDF parsed: ${text.length} chars, ${result.numpages} pages`);
        } catch (e: any) {
          console.error('[Stage 1] R2 fetch failed:', e);
          throw new Error(`R2_FAULT: ${e.message}`);
        }
      } else {
        console.log(`[Stage 1] Using pre-extracted text from client: ${text.length} chars`);
      }

      console.log(`[Stage 1] Text sample (first 300 chars):\n${text.substring(0, 300)}`);

      if (text.length < 200) throw new Error(
        `PDF_TOO_SHORT: only ${text.length} chars extracted — bad PDF?`
      );

      const sample  = (doc.name || '') + ' ' + text.substring(0, 2000);
      const board   = detectBoard(sample);
      const subject = detectSubject(sample);
      const pages   = Math.ceil(text.length / 2000);
      console.log(`[Stage 1] Detected: board=${board} subject=${subject} isPrimary=${PRIMARY_SUBJECTS.has(subject)} ~${pages} pages`);

      await supabase.from('documents').update({
        extracted_text  : text,
        document_summary: `raw|board:${board}|subject:${subject}|len:${text.length}`,
        status          : 'processing',
      }).eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE, progress: 25, message: 'Extracting SLOs...',
      });
      job = await queue.getJobStatus(documentId);
    }

    // ════════════════════════════════════════════════════════
    // STAGE 2 — LINEARIZE (AI → Ledger Markdown)
    // ════════════════════════════════════════════════════════
    if (job.step === IngestionStep.LINEARIZE) {
      console.log(`[Stage 2] START`);

      const { data: cur } = await supabase
        .from('documents')
        .select('extracted_text, document_summary')
        .eq('id', documentId)
        .single();

      const rawText = cur?.extracted_text || '';
      const meta    = cur?.document_summary || '';
      const board   = meta.match(/board:(\w+)/)?.[1]      || 'SINDH';
      const subject = meta.match(/subject:([A-Z]+)/)?.[1] || 'B';

      console.log(`[Stage 2] board=${board} subject=${subject} isPrimary=${PRIMARY_SUBJECTS.has(subject)} rawText.length=${rawText.length}`);

      if (!rawText || rawText.length < 200) {
        throw new Error(
          `STAGE2_FAULT: extracted_text is empty (${rawText.length} chars). document_summary: "${meta}"`
        );
      }

      let skipExtraction = false;
      const isLedgerText = rawText.startsWith('# ') || rawText.startsWith('Board:') || rawText.startsWith('```json') || rawText.startsWith('{') || rawText.trim().startsWith('{');
      
      if (isLedgerText) {
        console.warn('[Stage 2] Already a ledger — checking if SLO database needs population');
        
        const { count, error: countErr } = await supabase
          .from('slo_database')
          .select('*', { count: 'exact', head: true })
          .eq('document_id', documentId);
          
        if (!countErr && count && count > 0) {
          console.log(`[Stage 2] SLO database already has ${count} records — skipping re-extraction`);
          skipExtraction = true;
        } else {
          console.log('[Stage 2] SLO database is empty for ledger — attempting to parse and populate from existing JSON');
          
          try {
            const data = safeJson(rawText);
            let items: any[] = [];
            
            if (data.curriculum && Array.isArray(data.curriculum)) {
              if (data.curriculum.length > 0 && data.curriculum[0].domains) {
                // Hierarchical structure
                for (const g of data.curriculum) {
                  for (const d of g.domains || []) {
                    for (const s of d.slos || []) {
                      items.push({
                        ...s,
                        grade: g.grade,
                        domain: d.domain,
                        domain_name: d.domain_name
                      });
                    }
                  }
                }
              } else {
                // Flat structure
                items = data.curriculum;
              }
            } else if (data.slos && Array.isArray(data.slos)) {
              items = data.slos;
            }

            if (items && items.length > 0) {
              const records = items.map((s: any) => ({
                document_id: documentId,
                slo_code: s.slo_code || s.code || null,
                slo_full_text: s.slo_full_text || s.text || '',
                grade_level: s.grade || s.grade_level,
                domain: s.domain,
                domain_name: s.domain_name,
                benchmark: s.benchmark,
                subject: data.metadata?.subject || subject,
                board: data.metadata?.board || board,
                extraction_confidence: 1.0,
                created_at: new Date().toISOString(),
                teaching_strategies: s.teaching_strategies || [],
                assessment_ideas: s.assessment_ideas || [],
                prerequisite_concepts: s.prerequisite_concepts || [],
                common_misconceptions: s.common_misconceptions || []
              })).filter((r: any) => r.slo_full_text);

              if (records.length > 0) {
                const coded = records.filter((r: any) => r.slo_code != null);
                const codeless = records.filter((r: any) => r.slo_code == null);
                
                if (coded.length > 0) {
                  await supabase.from('slo_database').insert(coded);
                }
                if (codeless.length > 0) {
                  await supabase.from('slo_database').insert(codeless);
                }
                console.log(`[Stage 2] Populated DB with ${records.length} SLOs from existing ledger ✓`);
                skipExtraction = true;
              }
            } else {
               console.warn('[Stage 2] Parsed JSON but found no items. Falling back to extraction.');
            }
          } catch (e) {
            console.error('[Stage 2] Failed to parse existing ledger JSON:', e);
            // Fall through to AI extraction if parsing fails
          }
        }
      }

      if (!skipExtraction) {
        const apiKey =
          process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
          process.env.API_KEY ||
          process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
          process.env.GEMINI_API_KEY ||
          process.env.GOOGLE_AI_API_KEY ||
          '';

        if (!apiKey) {
          throw new Error(
            'API_KEY_MISSING: set NEXT_PUBLIC_GEMINI_API_KEY or API_KEY in the environment.\n' +
            'Checked: NEXT_PUBLIC_GEMINI_API_KEY, API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY'
          );
        }
        console.log(`[Stage 2] API key found (${apiKey.substring(0, 8)}...)`);

        const domainMap = scanDomains(rawText);
        console.log(`[Stage 2] Pre-scanned domains:`, Object.keys(domainMap));

        const slos = await extractSlos(rawText, board, subject, domainMap, apiKey, documentId, supabase, job.id, queue);

        console.log(`[Stage 2] === EXTRACTION RESULTS ===`);
        console.log(`[Stage 2] Total SLOs: ${slos.length}`);
        console.log(`[Stage 2] Grades:`,  [...new Set(slos.map((s: any) => s.grade))].sort());
        console.log(`[Stage 2] Domains:`, [...new Set(slos.map((s: any) => s.domain))].sort());
        console.log(`[Stage 2] Null codes (codeless):`, slos.filter((s: any) => !s.slo_code).length);
        console.log(`[Stage 2] Truncated:`, slos.filter((s: any) => s.is_truncated).length);

        if (slos.length === 0) {
          const regexCount = extractRawSloBlocks(rawText).length;
          console.error(`[Stage 2] ZERO SLOs — regexCount=${regexCount} rawLen=${rawText.length}`);
          await supabase.from('documents').update({
            status: 'failed',
            document_summary: `slo_extraction_failed|regex:${regexCount}|raw_len:${rawText.length}|board:${board}|subject:${subject}`,
          }).eq('id', documentId);
          await queue.markFailed(job.id, `SLO extraction failed. 0 SLOs found (Regex found ${regexCount} blocks).`);
          return NextResponse.json({ error: 'SLO extraction failed' }, { status: 500 });
        } else {
          // Fetch all SLOs from DB to ensure we have the complete list if we resumed
          const { data: allDbSlos } = await supabase.from('slo_database').select('*').eq('document_id', documentId);
          const fullSloList = (allDbSlos && allDbSlos.length > 0) ? allDbSlos : slos;
          
          const ledger = buildLedger(fullSloList, board, subject);
          console.log(`[Stage 2] Built ledger with ${fullSloList.length} SLOs. Updating document...`);

          await supabase.from('documents').update({
            extracted_text  : ledger,
            document_summary: `ledger|slos:${fullSloList.length}|board:${board}|subject:${subject}`,
          }).eq('id', documentId);
          console.log(`[Stage 2] Ledger saved ✓`);
        }

        await queue.updateProgress(job.id, {
          step: IngestionStep.EMBED, progress: 75, message: 'Building RAG index...',
        });
        job = await queue.getJobStatus(documentId);
      } else {
        // Skip extraction but move to next step
        await queue.updateProgress(job.id, {
          step: IngestionStep.EMBED, progress: 75, message: 'Indexing ledger...',
        });
        job = await queue.getJobStatus(documentId);
      }
    }

    // ════════════════════════════════════════════════════════
    // STAGE 3 — ENRICH: SKIPPED
    // ════════════════════════════════════════════════════════
    if (job.step === IngestionStep.ENRICH) {
      console.log(`[Stage 3] Skipped`);
      await queue.updateProgress(job.id, {
        step: IngestionStep.EMBED, progress: 75, message: 'Building RAG index...',
      });
      job = await queue.getJobStatus(documentId);
    }

    // ════════════════════════════════════════════════════════
    // STAGE 4 — EMBED (RAG vector indexing)
    // ════════════════════════════════════════════════════════
    if (job.step === IngestionStep.EMBED) {
      console.log(`[Stage 4] START EMBED`);

      const { data: fin } = await supabase
        .from('documents')
        .select('extracted_text')
        .eq('id', documentId)
        .single();

      const txt = fin?.extracted_text || '';
      const isLedger = txt.startsWith('# ') || txt.startsWith('Board:') || txt.startsWith('```json') || txt.startsWith('{') || txt.trim().startsWith('{');
      console.log(`[Stage 4] Text to embed: ${txt.length} chars, isLedger: ${isLedger}`);

      if (txt.length >= 100) {
        await indexDocumentForRAG(documentId, txt, supabase, job.id);
      } else {
        console.warn(`[Stage 4] Text too short (${txt.length}) — skipping RAG`);
      }

      await queue.markComplete(job.id);
      
      // Explicit status update with error logging
      const { error: updateErr } = await supabase
        .from('documents')
        .update({
          status          : 'ready',
          rag_indexed     : true,
          document_summary: isLedger
            ? txt.split('\n').slice(0, 4).join(' | ')
            : 'indexed',
        })
        .eq('id', documentId);

      if (updateErr) {
        console.error('[Stage 4] FAILED to update doc status to ready:', updateErr);
      } else {
        console.log('[Stage 4] Document status → ready ✓');
      }
    }

    console.log(`[Ingestion] DONE doc=${documentId}`);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    const msg = String(err.message || err).substring(0, 500);
    console.error(`[Ingestion] FATAL doc=${documentId}:`, msg);
    try { await queue.markFailed(job.id, msg); }    catch (_) {}
    try {
      await supabase.from('documents')
        .update({ status: 'failed', document_summary: msg })
        .eq('id', documentId);
    } catch (_) {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
