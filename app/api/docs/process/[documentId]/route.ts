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
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ── CONFIG ────────────────────────────────────────────────────────────────────
const MODEL_PRIMARY  = 'gemini-1.5-pro';
const MODEL_FALLBACK = 'gemini-2.0-flash';

const CHUNK_SIZE  = 16000;
const OVERLAP     = 4000;
const MIN_ADVANCE = 8000;

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
function normalizeGrade(raw: string): string | null {
  if (!raw) return null;
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
function normalizeCode(raw: string): string | null {
  if (!raw || raw === 'null') return null;

  let s = raw.toUpperCase()
    .replace(/^\[?(?:5L0|SL[O0]|LO|SW)\s*[:\s]*/i, '')
    .replace(/[\[\]():]/g, '')
    .replace(/[.\s]/g, '')
    .trim();

  // Grade-range codes: M-01-02-A-01 (appears in cross-grade benchmarks) → take first grade
  const gradeRange = s.match(/^([A-Z]{1,3})-?(\d{2})-(\d{2})-?([A-Z])-?(\d{1,3})$/);
  if (gradeRange) {
    return `${gradeRange[1]}${gradeRange[2]}${gradeRange[4]}${gradeRange[5].padStart(2, '0')}`;
  }

  s = s.replace(/-/g, ''); // remove all dashes

  // ── OCR fixes (applied before matching) ──────────────────────────────────
  // Fix 0l / 0L / 0I in GRADE position (between subject code and domain letter)
  // e.g. M0LA09 → M01A09,  C0LA03 → C01A03
  s = s.replace(/([A-Z]{1,3})0[LlIi]([A-Z])/, '$101$2');

  // Fix 0l / 0L / 0I at END of string (SLO number position)
  s = s.replace(/0[LlIi]$/i, '01');

  // Fix trailing l or I (SLO number)
  s = s.replace(/[lI]$/i, '1');

  // Fix O in digit positions (e.g. AO1 → A01)
  s = s.replace(/([A-Z])O(\d)/, '$10$2');
  s = s.replace(/(\d)O([A-Z\d])/, '$10$2');

  // Roman numeral grade embedded in code: MVIIIA01 → M08A01
  const romMatch = s.match(/^([A-Z]{1,3})(XII|XI|IX|X|VIII|VII|VI|V|IV|III|II)([A-Z])(\d{1,3})$/);
  if (romMatch) {
    return `${romMatch[1]}${ROMAN[romMatch[2]] ?? romMatch[2]}${romMatch[3]}${romMatch[4].padStart(2, '0')}`;
  }

  // Standard pattern: M01A01 or C09A01
  const numMatch = s.match(/^([A-Z]{1,3})(\d{1,2})([A-Z])(\d{1,3})$/);
  if (numMatch) {
    const sloNum = numMatch[4].startsWith('00') ? numMatch[4].slice(-2) : numMatch[4].padStart(2, '0');
    return `${numMatch[1]}${numMatch[2].padStart(2, '0')}${numMatch[3]}${sloNum}`;
  }

  return null;
}

// ── MATH TABLE LINEARIZER ────────────────────────────────────────────────────
// The Math curriculum stores SLOs in an 8-column horizontal table (one column per
// grade). pdf-parse reads left-to-right, producing chunks like:
//
//   [SLO:M-01-A-0l] [SLO:M-02-A-0l] [SLO:M-03-A-0l]
//   Count objects   Count numbers   Count up to 9999
//
// This function scans for all SLO codes and attaches the text block that follows
// the LAST code in each row to all codes in that row, preserving which code it is.
// The AI then receives a clean list: "CODE: text" per line.
function linearizeMathText(text: string): string {
  // Match any Math SLO code variant
  const codeRe = /\[\s*(?:5L0|SL[O0]|LO|SW|SLO)\s*[:\s]+M\s*[-\s]*\d{1,2}\s*[-\s]*[A-Z]\s*[-\s]*\d{1,2}[lI0-9]*\s*\]/gi;

  const matches: { start: number; end: number; raw: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(text)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, raw: m[0] });
  }

  if (matches.length === 0) return text; // no math codes found

  // Group codes that appear on the same line (within 200 chars of each other with no newline between)
  type Group = { codes: string[]; textStart: number };
  const groups: Group[] = [];
  let i = 0;
  while (i < matches.length) {
    const group: Group = { codes: [matches[i].raw], textStart: matches[i].end };
    while (
      i + 1 < matches.length &&
      matches[i + 1].start - matches[i].end < 200 &&
      !text.slice(matches[i].end, matches[i + 1].start).includes('\n')
    ) {
      i++;
      group.codes.push(matches[i].raw);
      group.textStart = matches[i].end;
    }
    groups.push(group);
    i++;
  }

  // For each group, grab text from after the last code to the start of the next group
  const lines: string[] = [];
  for (let g = 0; g < groups.length; g++) {
    const textEnd = g + 1 < groups.length ? groups[g + 1].codes[0] === groups[g + 1].codes[0]
      ? text.indexOf(groups[g + 1].codes[0], groups[g].textStart) ?? text.length
      : text.length : text.length;

    // Actually find the start of the next group's first code
    let nextGroupStart = text.length;
    if (g + 1 < groups.length) {
      const nextCode = groups[g + 1].codes[0];
      const pos = text.indexOf(nextCode, groups[g].textStart);
      if (pos !== -1) nextGroupStart = pos;
    }

    const rawText = text
      .slice(groups[g].textStart, nextGroupStart)
      .replace(/[\r\n\t ]+/g, ' ')
      .trim();

    // Emit one line per code; all codes in the row share the same text block
    // (the AI will sort out which text belongs to which grade)
    for (const code of groups[g].codes) {
      lines.push(`${code} ${rawText}`);
    }
  }

  return lines.join('\n');
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
function safeJson(raw: string): { slos: any[] } {
  if (!raw?.trim()) return { slos: [] };
  const c = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(c); } catch {/* */}
  const m = c.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {/* */}
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
    if (!s.slo_full_text?.trim()) continue;

    const code = normalizeCode(s.slo_code);
    let grade  = normalizeGrade(s.grade || '');
    let domain = s.domain?.trim().toUpperCase().match(/^([A-Z])/)?.[1] ?? null;
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
      slo_full_text     : s.slo_full_text.trim(),
      grade,
      domain,
      domain_name       : dname,
      benchmark         : s.benchmark || null,
      subject           : SUBJECTS[subjectCode] || subjectCode,
      subject_code      : subjectCode,
      board             : boardKey,
      is_truncated      : Boolean(s.is_truncated),
      is_orphan_domain  : !domain,
      regex_confidence  : code ? 1.0 : 0.5,
    });
  }
  return processed;
}

// ── EXTRACTION PROMPT ─────────────────────────────────────────────────────────
function makePrompt(
  chunk: string,
  subject: string,
  subjectCode: string,
  board: string,
  chunkN: number
): string {
  // Math (and primary-level subjects) use grades I-VIII (01-08)
  // Secondary subjects (Biology, Chemistry, Physics) use grades IX-XII (09-12)
  const isPrimary = PRIMARY_SUBJECTS.has(subjectCode);

  const gradeSection = isPrimary ? `
=== GRADE SYSTEM (Primary - Grades I to VIII) ===
This is a PRIMARY curriculum covering Grades I through VIII.
Grade mapping: I→01, II→02, III→03, IV→04, V→05, VI→06, VII→07, VIII→08
ALWAYS use 2-digit grade: Grade I → 01, Grade VIII → 08
SLO code examples for ${subjectCode}:
  [SLO:${subjectCode}-01-A-01] → ${subjectCode}01A01   (Grade I)
  [SLO:${subjectCode}-02-A-0l] → ${subjectCode}02A01   (Grade II, OCR: 0l=01)
  [SLO:${subjectCode}-07-B-12] → ${subjectCode}07B12   (Grade VII)
  [SLO:${subjectCode}-08-A-16] → ${subjectCode}08A16   (Grade VIII)
  [SLO:${subjectCode}-0l-A-09] → ${subjectCode}01A09   (OCR: 0l in grade = 01)` : `
=== GRADE SYSTEM (Secondary - Grades IX to XII) ===
Grade mapping: IX→09, X→10, XI→11, XII→12, always 2-digit
SLO code examples for ${subjectCode}:
  [SLO:${subjectCode}-09-A-01] → ${subjectCode}09A01
  [SLO:${subjectCode}-09-A-0l] → ${subjectCode}09A01  (l=OCR for 1)
  [SLO:${subjectCode}-11-B-06] → ${subjectCode}11B06`;

  const mathTableNote = isPrimary ? `
=== IMPORTANT: HORIZONTAL TABLE LAYOUT ===
In this curriculum, SLOs are arranged in a HORIZONTAL TABLE with one column per grade.
When pdf-parse extracts the text, multiple SLO codes appear on the SAME LINE, followed
by their text on the lines below — all columns merged together. Example:
  [SLO:${subjectCode}-01-A-0l] [SLO:${subjectCode}-02-A-0l] [SLO:${subjectCode}-03-A-0l]
  Count objects and  Count numbers up  Count up to 9999
  numbers to 99...   to 999...         (4-digit numbers)

Each [SLO:${subjectCode}-XX-X-XX] code is a SEPARATE SLO. Extract EACH one.
For the text: each code gets the text in its corresponding position. If text is
jumbled/merged from multiple grades, give each code a best-guess text from the merged block.
Never skip a code — even if the text seems incomplete, extract it.` : '';

  return `Extract ALL Student Learning Outcomes (SLOs) from this ${subject} curriculum text.
Board: ${board}  Subject prefix: "${subjectCode}"  Chunk: ${chunkN}
${gradeSection}

=== SLO CODE FORMAT ===
Pattern: [SUBJECT][GRADE][DOMAIN][NUMBER]  →  no dashes, no brackets
SLO number: always 2-digit (1→01)
${mathTableNote}

=== OCR FIXES (apply before normalizing) ===
1. Strip: [SLO:  SLO:  SL0:  5L0:  LO:  SW:
2. Remove [ ] ( ) :
3. Remove all dashes and spaces
4. "0l" or "0L" or "0I" anywhere → "01"  (critical: applies in GRADE and NUMBER positions)
5. Trailing l or I → 1
6. O in digit position → 0
7. Pad grade to 2 digits, pad SLO# to 2 digits
8. Roman grade: ${isPrimary ? 'I→01 II→02 III→03 IV→04 V→05 VI→06 VII→07 VIII→08' : 'IX→09 X→10 XI→11 XII→12'}

=== DETECTION RULES ===
- grade: from SLO code > "Grade-${isPrimary ? 'I/II/III...VIII' : 'IX/X/XI/XII'}" header > null (NEVER guess)
- domain: from SLO code letter > "DOMAIN X: ..." heading > null
- benchmark: copy verbatim "Benchmark N: ..." or null
- is_truncated: true if text ends mid-sentence, ends with comma, < 8 words
- Codeless SLOs: slo_code:null, is_orphan_domain:true

=== PROHIBITIONS ===
❌ Never invent codes  ❌ Never skip SLOs  ❌ Never change slo_full_text
❌ Never invent domain_name  ❌ Never merge/split SLOs

Return ONLY raw JSON (no fences, no commentary):
{"slos":[{"slo_code":"${subjectCode}${isPrimary ? '01' : '09'}A01","raw_code_as_found":"[SLO:${subjectCode}-${isPrimary ? '01' : '09'}-A-01]","slo_full_text":"Exact text","grade":"${isPrimary ? '01' : '09'}","domain":"A","domain_name":"Domain name or null","benchmark":null,"is_truncated":false,"is_orphan_domain":false}]}

Sort: grade asc → domain asc → SLO# asc. Codeless SLOs first per grade.

=== TEXT ===
${chunk}`;
}

// ── GEMINI CALL ───────────────────────────────────────────────────────────────
async function callGemini(ai: GoogleGenAI, prompt: string, schema: any): Promise<any[]> {
  const cfg = {
    responseMimeType: 'application/json' as const,
    responseSchema  : schema,
    maxOutputTokens : 8192,
  };
  try {
    const r = await ai.models.generateContent({
      model   : MODEL_PRIMARY,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config  : cfg,
    });
    const raw = r.text || '';
    console.log(`[Gemini] ${MODEL_PRIMARY} responded ${raw.length} chars`);
    const d = safeJson(raw);
    if (Array.isArray(d.slos) && d.slos.length > 0) return d.slos;
    console.warn(`[Gemini] ${MODEL_PRIMARY} returned 0 SLOs — trying fallback`);
  } catch (e: any) {
    const isQuota = /429|quota|RESOURCE_EXHAUSTED/i.test(e.message || '');
    if (!isQuota) {
      console.error(`[Gemini] ${MODEL_PRIMARY} error (non-quota):`, e.message);
      throw e;
    }
    console.warn(`[Gemini] Quota hit on ${MODEL_PRIMARY} → falling back`);
  }

  console.log(`[Gemini] Trying fallback: ${MODEL_FALLBACK}`);
  const r2 = await ai.models.generateContent({
    model   : MODEL_FALLBACK,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config  : { ...cfg, maxOutputTokens: 4096 },
  });
  const raw2 = r2.text || '';
  console.log(`[Gemini] ${MODEL_FALLBACK} responded ${raw2.length} chars`);
  return safeJson(raw2).slos || [];
}

// ── SLIDING WINDOW EXTRACTOR ──────────────────────────────────────────────────
async function extractSlos(
  text       : string,
  boardKey   : string,
  subjectCode: string,
  domainMap  : Record<string, string>,
  apiKey     : string
): Promise<any[]> {

  const ai          = new GoogleGenAI({ apiKey });
  const subjectName = SUBJECTS[subjectCode] || subjectCode;
  const isPrimary   = PRIMARY_SUBJECTS.has(subjectCode);
  const allSlos     : any[] = [];
  const seenFp      = new Set<string>();
  let   offset      = 0;
  let   chunkIndex  = 0;

  // For Math (horizontal table layout), pre-process the full text to linearize
  // the SLO table before chunking. This converts the multi-column grid into a
  // vertical list of "CODE text" lines.
  const processedText = isPrimary ? linearizeMathText(text) : text;
  console.log(`[Extract] isPrimary=${isPrimary} rawLen=${text.length} processedLen=${processedText.length}`);

  const schema = {
    type      : Type.OBJECT,
    properties: {
      slos: {
        type : Type.ARRAY,
        items: {
          type      : Type.OBJECT,
          properties: {
            slo_code         : { type: Type.STRING  },
            raw_code_as_found: { type: Type.STRING  },
            slo_full_text    : { type: Type.STRING  },
            grade            : { type: Type.STRING  },
            domain           : { type: Type.STRING  },
            domain_name      : { type: Type.STRING  },
            benchmark        : { type: Type.STRING  },
            is_truncated     : { type: Type.BOOLEAN },
            is_orphan_domain : { type: Type.BOOLEAN },
          },
          required: ['slo_full_text'],
        },
      },
    },
  };

  while (offset < processedText.length) {
    chunkIndex++;

    let end = Math.min(offset + CHUNK_SIZE, processedText.length);
    if (end < processedText.length) {
      const zone = processedText.substring(end - 800, end);
      const nl   = zone.lastIndexOf('\n');
      if (nl !== -1) end = (end - 800) + nl + 1;
    }

    const chunk = processedText.substring(offset, end);
    console.log(`[Extract] Chunk ${chunkIndex}: offset=${offset} len=${chunk.length} totalSoFar=${allSlos.length}`);

    try {
      const prompt    = makePrompt(chunk, subjectName, subjectCode, boardKey, chunkIndex);
      const chunkSlos = await callGemini(ai, prompt, schema);

      let added = 0;
      for (const s of chunkSlos) {
        if (!s.slo_full_text?.trim()) continue;
        const fp = createHash('md5').update(`${s.slo_code ?? 'null'}|${s.slo_full_text}`).digest('hex');
        if (!seenFp.has(fp)) {
          seenFp.add(fp);
          allSlos.push(s);
          added++;
        }
      }
      console.log(`[Extract] Chunk ${chunkIndex}: +${added} new SLOs (${allSlos.length} total)`);

    } catch (err: any) {
      console.error(`[Extract] Chunk ${chunkIndex} FAILED:`, err.message);
    }

    const rawNext = end - OVERLAP;
    offset        = Math.max(offset + MIN_ADVANCE, rawNext);
    if (offset > 900_000) {
      console.warn('[Extract] Safety cap at 900k chars');
      break;
    }
  }

  console.log(`[Extract] Done. Raw SLOs: ${allSlos.length}`);
  const processed = processSlos(allSlos, boardKey, subjectCode, domainMap);
  console.log(`[Extract] After processSlos: ${processed.length}`);
  return processed;
}

// ── LEDGER MARKDOWN BUILDER ───────────────────────────────────────────────────
function buildLedger(slos: any[], boardKey: string, subjectCode: string): string {
  const subjectName = SUBJECTS[subjectCode] || subjectCode;

  const sorted = [...slos].sort((a, b) => {
    if (!a.slo_code && b.slo_code)  return -1;
    if (a.slo_code  && !b.slo_code) return  1;
    const gA = parseInt(a.grade || '99', 10) || 99;
    const gB = parseInt(b.grade || '99', 10) || 99;
    if (gA !== gB) return gA - gB;
    const dA = (a.domain || 'ZZ').toUpperCase();
    const dB = (b.domain || 'ZZ').toUpperCase();
    if (dA !== dB) return dA.localeCompare(dB);
    return (parseInt((a.slo_code || '').slice(-2), 10) || 0)
         - (parseInt((b.slo_code || '').slice(-2), 10) || 0);
  });

  const grades = [...new Set(sorted.map(s => s.grade).filter(Boolean))].sort();
  const lines: string[] = [];

  lines.push(`Board: ${BOARD_NAMES[boardKey] ?? boardKey}`);
  lines.push(`Subject: ${subjectName}`);
  lines.push(`SLOs: ${sorted.length}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## SUMMARY');
  for (const g of grades) {
    const gs = sorted.filter(s => s.grade === g);
    const ds = [...new Set(gs.map(s => s.domain).filter(Boolean))].sort();
    const summary = ds.map(d => {
      const n  = gs.filter(s => s.domain === d).length;
      const dn = gs.find(s => s.domain === d)?.domain_name;
      return dn ? `${d}:${dn}(${n})` : `${d}(${n})`;
    }).join(', ');
    // Use Roman numerals for primary subjects in summary (more readable)
    const gradeLabel = PRIMARY_SUBJECTS.has(subjectCode)
      ? Object.entries(ROMAN).find(([, v]) => v === g)?.[0] ?? g
      : g;
    lines.push(`Grade ${gradeLabel}: ${summary} [${gs.length}]`);
  }
  lines.push('');

  let lastGrade = '', lastDomain = '';
  for (const s of sorted) {
    const g = s.grade  || 'I-VIII';
    const d = (s.domain || 'GENERAL').toUpperCase();

    if (g !== lastGrade) {
      const gradeLabel = PRIMARY_SUBJECTS.has(subjectCode)
        ? Object.entries(ROMAN).find(([, v]) => v === g)?.[0] ?? g
        : g;
      lines.push(''); lines.push(`# GRADE ${gradeLabel}`);
      lastGrade  = g;
      lastDomain = '';
    }
    if (d !== lastDomain) {
      const dn = s.domain_name ? `: ${s.domain_name}` : '';
      lines.push(''); lines.push(`### DOMAIN ${d}${dn}`); lines.push('');
      lastDomain = d;
    }

    if (s.slo_code) {
      lines.push(`SLO ${s.slo_code} ${s.slo_full_text}${s.is_truncated ? ' [TRUNCATED]' : ''}`);
    } else {
      lines.push(`[GENERAL] ${s.slo_full_text}`);
    }
  }

  lines.push(''); lines.push('');
  lines.push('<STRUCTURED_INDEX>');
  lines.push(JSON.stringify({
    board      : boardKey,
    subject    : subjectCode,
    subjectName,
    grades,
    domains    : [...new Set(sorted.map(s => s.domain).filter(Boolean))].sort(),
    totalSlos  : sorted.length,
    domainNames: Object.fromEntries(
      sorted
        .filter(s => s.domain && s.domain_name)
        .map(s => [s.domain, s.domain_name])
        .filter((v, i, a) => a.findIndex((x: any) => x[0] === v[0]) === i)
    ),
  }, null, 2));
  lines.push('</STRUCTURED_INDEX>');

  return lines.join('\n');
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
  }
  if (job.step === IngestionStep.COMPLETE) {
    return NextResponse.json({ success: true, done: true, step: 'COMPLETE', progress: 100 });
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

      const r2Path = doc.file_path;
      if (!r2Path) throw new Error('R2_FAULT: No file_path on document');

      const buffer = await getObjectBuffer(r2Path);
      if (!buffer)  throw new Error('R2_FAULT: File unreachable from R2');

      const result = await pdf(buffer);
      const text   = result.text?.trim() || '';
      console.log(`[Stage 1] PDF parsed: ${text.length} chars, ${result.numpages} pages`);
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

      if (rawText.startsWith('Board:')) {
        console.warn('[Stage 2] Already a ledger — skipping re-extraction');
        await queue.updateProgress(job.id, {
          step: IngestionStep.EMBED, progress: 75, message: 'Indexing ledger...',
        });
        job = await queue.getJobStatus(documentId);
      } else {
        const apiKey =
          process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
          process.env.GEMINI_API_KEY ||
          process.env.GOOGLE_AI_API_KEY ||
          '';

        if (!apiKey) {
          throw new Error(
            'API_KEY_MISSING: set GOOGLE_GENERATIVE_AI_API_KEY in .env.local\n' +
            'Checked: GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, GOOGLE_AI_API_KEY'
          );
        }
        console.log(`[Stage 2] API key found (${apiKey.substring(0, 8)}...)`);

        const domainMap = scanDomains(rawText);
        console.log(`[Stage 2] Pre-scanned domains:`, Object.keys(domainMap));

        const slos = await extractSlos(rawText, board, subject, domainMap, apiKey);

        console.log(`[Stage 2] === EXTRACTION RESULTS ===`);
        console.log(`[Stage 2] Total SLOs: ${slos.length}`);
        console.log(`[Stage 2] Grades:`,  [...new Set(slos.map((s: any) => s.grade))].sort());
        console.log(`[Stage 2] Domains:`, [...new Set(slos.map((s: any) => s.domain))].sort());
        console.log(`[Stage 2] Null codes (codeless):`, slos.filter((s: any) => !s.slo_code).length);
        console.log(`[Stage 2] Truncated:`, slos.filter((s: any) => s.is_truncated).length);

        if (slos.length === 0) {
          console.error('[Stage 2] ZERO SLOs — preserving raw text');
          await supabase.from('documents').update({
            document_summary: `slo_extraction_failed|board:${board}|subject:${subject}|raw_len:${rawText.length}`,
          }).eq('id', documentId);
        } else {
          const records = slos.map((s: any) => ({
            document_id          : documentId,
            slo_code             : s.slo_code,
            slo_full_text        : s.slo_full_text,
            domain               : s.domain,
            domain_name          : s.domain_name,
            bloom_level          : null,
            subject              : s.subject,
            grade_level          : s.grade,
            extraction_confidence: s.slo_code ? 0.92 : 0.5,
            page_number          : null,
            is_truncated         : s.is_truncated,
            is_orphan_domain     : s.is_orphan_domain,
            raw_code_as_found    : s.raw_code_as_found,
            char_offset          : 0,
            benchmark            : s.benchmark,
            board                : s.board,
          }));

          const deduped  = dedupe(records);
          const coded    = deduped.filter(r => r.slo_code != null);
          const codeless = deduped.filter(r => r.slo_code == null);
          console.log(`[Stage 2] Deduped: ${deduped.length} (${coded.length} coded, ${codeless.length} codeless)`);

          await supabase.from('slo_database').delete().eq('document_id', documentId);

          if (coded.length > 0) {
            const { error } = await supabase
              .from('slo_database')
              .upsert(coded, { onConflict: 'document_id,slo_code' });
            if (error) throw new Error(`DB_FAULT (coded upsert): ${error.message}`);
          }
          if (codeless.length > 0) {
            const { error } = await supabase.from('slo_database').insert(codeless);
            if (error) console.warn(`[Stage 2] codeless insert warning: ${error.message}`);
          }
          console.log(`[Stage 2] DB write OK`);

          const ledger = buildLedger(slos, board, subject);
          console.log(`[Stage 2] Ledger built: ${ledger.length} chars`);
          console.log(`[Stage 2] Ledger preview:\n${ledger.substring(0, 600)}\n...`);

          await supabase.from('documents').update({
            extracted_text  : ledger,
            document_summary: `ledger|slos:${slos.length}|board:${board}|subject:${subject}`,
          }).eq('id', documentId);
          console.log(`[Stage 2] Ledger saved ✓`);
        }

        await queue.updateProgress(job.id, {
          step: IngestionStep.EMBED, progress: 75, message: 'Building RAG index...',
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
      console.log(`[Stage 4] Text to embed: ${txt.length} chars, isLedger: ${txt.startsWith('Board:')}`);

      if (txt.length >= 100) {
        await indexDocumentForRAG(documentId, txt, supabase, job.id);
      } else {
        console.warn(`[Stage 4] Text too short (${txt.length}) — skipping RAG`);
      }

      await queue.markComplete(job.id);
      await supabase.from('documents').update({
        status          : 'ready',
        rag_indexed     : true,
        document_summary: txt.startsWith('Board:')
          ? txt.split('\n').slice(0, 4).join(' | ')
          : 'indexed',
      }).eq('id', documentId);

      console.log(`[Stage 4] Complete ✓`);
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
