// FIXED v6.0: app/api/docs/process/[documentId]/route.ts — Pedagogy Master AI
// ═══════════════════════════════════════════════════════════════════════
// UNIVERSAL CURRICULUM INGESTION ENGINE v6.0 (LEDGER EDITION)
// ─────────────────────────────────────────────────────────────────────
// Stage 1 — EXTRACT   : pdf-parse (deterministic)
// Stage 2 — LINEARIZE : AI extraction → structured SLO records
// Stage 3 — ENRICH    : Bloom Taxonomy classification (stub → real)
// Stage 4 — EMBED     : Vector indexing
//
// OUTPUT FORMAT (auto-generated Ledger Markdown):
// ─────────────────────────────────────────────────────────────────────
// Board: Sindh Textbook Board
// Subject: Biology
//
// # GRADE 09
// ### DOMAIN A: Nature of Science in Biology
// SLO B09A01 Concept of biology
// SLO B09A02 Point out Quranic instructions to reveal the study of Life
// ...
// # GRADE 10
// ### DOMAIN J: Human Physiology
// SLO B10J01 Concept of holozoic nutrition...
// ═══════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const CHUNK_SIZE    = 18000;
const OVERLAP       = 4500;
const MIN_ADVANCE   = Math.floor(CHUNK_SIZE / 2); // BUG-4 FIX: guarantee progress
const MAX_OUTPUT_TOKENS = 8192;
const MAX_TEXT_BYTES    = 1_000_000;

// BUG-3 FIX: Use real model names
const MODEL_PRIMARY  = 'gemini-1.5-pro-latest';
const MODEL_FALLBACK = 'gemini-1.5-flash-latest';

// ═══════════════════════════════════════════════════════════════════════
// ROMAN NUMERAL → GRADE MAP
// ═══════════════════════════════════════════════════════════════════════

const ROMAN_TO_GRADE: Record<string, string> = {
  'I'   : '01', 'II'  : '02', 'III' : '03', 'IV'  : '04',
  'V'   : '05', 'VI'  : '06', 'VII' : '07', 'VIII': '08',
  'IX'  : '09', 'X'   : '10', 'XI'  : '11', 'XII' : '12',
};

// ═══════════════════════════════════════════════════════════════════════
// UNIVERSAL SLO CODE NORMALIZER
// BUG-7 FIX: handles Roman numeral grades (B-IX-A-01 → B09A01)
// ═══════════════════════════════════════════════════════════════════════

function normalizeUniversalSloCode(code: string): string | null {
  if (!code || code === 'null') return null;

  let cleaned = code
    .toUpperCase()
    // Strip known prefixes: [SLO:  SLO:  SL0:  5L0:  LO:
    .replace(/^\[?(?:5L0|SL[O0]|LO)\s*[:\s]*/i, '')
    // Strip wrappers [ ] ( ) :
    .replace(/[\[\]():]/g, '')
    // Strip dots and spaces
    .replace(/[·.\s]/g, '')
    .trim();

  // OCR fix: trailing lowercase l or uppercase I → 1
  cleaned = cleaned.replace(/[lI]$/, '1');
  // OCR fix: O in numeric position → 0
  cleaned = cleaned.replace(/(\d)O(\d|$)/, '$10$2');
  // Remove all dashes: C-09-A-01 → C09A01
  cleaned = cleaned.replace(/-/g, '');

  // BUG-7 FIX: Handle Roman numeral grade inside code
  // e.g. BIXA01 (from B-IX-A-01) or BXIIK03 (from B-XII-K-03)
  const romanMatch = cleaned.match(
    /^([A-Z]{1,3})(XII|XI|IX|X|VIII|VII|VI|V|IV|III|II)([A-Z])(\d{1,3})$/
  );
  if (romanMatch) {
    const [, subj, roman, domain, num] = romanMatch;
    const grade = ROMAN_TO_GRADE[roman] ?? roman;
    return `${subj}${grade.padStart(2, '0')}${domain}${num.padStart(2, '0')}`;
  }

  // Standard numeric pattern: B09A01
  const numMatch = cleaned.match(/^([A-Z]{1,3})(\d{1,2})([A-Z])(\d{1,3})$/);
  if (numMatch) {
    const [, subj, grade, domain, num] = numMatch;
    // Fix triple-zero padding artifact: 001 → 01
    const sloNum = num.startsWith('00') ? num.slice(-2) : num.padStart(2, '0');
    return `${subj}${grade.padStart(2, '0')}${domain}${sloNum}`;
  }

  console.warn(`[normalizeUniversalSloCode] Could not normalize: "${code}" → "${cleaned}"`);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// BOARD CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════

const SUBJECT_CODES: Record<string, string> = {
  'B'  : 'Biology',
  'C'  : 'Chemistry',
  'P'  : 'Physics',
  'M'  : 'Mathematics',
  'E'  : 'English',
  'U'  : 'Urdu',
  'S'  : 'General Science',       // BUG-6 FIX: was missing
  'CS' : 'Computer Science',
  'GEO': 'Geography',
  'ECO': 'Economics',             // BUG-6 FIX: was missing
  'PST': 'Pakistan Studies',      // BUG-6 FIX: was missing
};

const PAKISTAN_BOARDS: Record<string, {
  name: string;
  subjectCodes: Record<string, string>;
  sloRegex: RegExp;
  gradeRegex: RegExp;
  domainRegex: RegExp;
  benchmarkRegex: RegExp;
  patternType: 'hierarchical_code' | 'decimal' | 'lo_textual';
  normalizeFn: (code: string) => string | null;
}> = {
  SINDH: {
    name: 'Sindh Textbook Board',
    subjectCodes: SUBJECT_CODES,  // BUG-6 FIX: use universal map
    sloRegex: /(?:\[?SL[O0]:?\s*)?([A-Z]{1,3})[-]?(\d{1,2}|XII|XI|IX|X)[-]?([A-Z])[-]?(\d{1,3})\]?/gi,
    gradeRegex: /(?:grade|class|std)\s*[:\-]?\s*(IX|X{1,3}I{0,3}|V?I{1,3}|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: normalizeUniversalSloCode,  // BUG-7 FIX: universal normalizer
  },
  PUNJAB: {
    name: 'Punjab Curriculum & Textbook Board',
    subjectCodes: SUBJECT_CODES,
    sloRegex: /(?:SLO|LO|Outcome)\s*[:\-]?\s*(\d+)\.(\d+)\.(\d+)/g,
    gradeRegex: /(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/gi,
    domainRegex: /(?:UNIT|CHAPTER|TOPIC)\s+(\d+)\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:OBJECTIVE|OBJ)\s*[:\-]?\s*([^\n\r]{10,120})/gi,
    patternType: 'decimal',
    normalizeFn: (code: string) => code.trim().toUpperCase().replace(/[:\-]/g, ''),
  },
  FBISE: {
    name: 'Federal Board of Intermediate and Secondary Education',
    subjectCodes: SUBJECT_CODES,
    sloRegex: /(?:SLO|LO)\s*[:\-]?\s*([A-Z]{1,3})[-]?(\d{1,2})[-]?([A-Z])[-]?(\d{1,2})/gi,
    gradeRegex: /(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: normalizeUniversalSloCode,
  },
  KPK: {
    name: 'Khyber Pakhtunkhwa Textbook Board',
    subjectCodes: SUBJECT_CODES,
    sloRegex: /(?:SLO|LO)\s*[:\-]?\s*([A-Z]{1,3})[-]?(\d{1,2})[-]?([A-Z])[-]?(\d{1,2})/gi,
    gradeRegex: /(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: normalizeUniversalSloCode,
  },
  BALOCHISTAN: {
    name: 'Balochistan Curriculum & Textbook Board',
    subjectCodes: SUBJECT_CODES,
    sloRegex: /(?:SLO|LO)\s*[:\-]?\s*([A-Z]{1,3})[-]?(\d{1,2})[-]?([A-Z])[-]?(\d{1,2})/gi,
    gradeRegex: /(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: normalizeUniversalSloCode,
  },
  AJK: {
    name: 'AJK Textbook Board',
    subjectCodes: SUBJECT_CODES,
    sloRegex: /(?:SLO|LO)\s*[:\-]?\s*([A-Z]{1,3})[-]?(\d{1,2})[-]?([A-Z])[-]?(\d{1,2})/gi,
    gradeRegex: /(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: normalizeUniversalSloCode,
  },
};

// ═══════════════════════════════════════════════════════════════════════
// DETECTION HELPERS
// ═══════════════════════════════════════════════════════════════════════

function detectBoard(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('sindh') || t.includes('stbb') || t.includes('jamshoro')) return 'SINDH';
  if (t.includes('punjab') || t.includes('pctb') || t.includes('lahore')) return 'PUNJAB';
  if (t.includes('federal') || t.includes('fbise') || t.includes('islamabad')) return 'FBISE';
  if (t.includes('kpk') || t.includes('khyber') || t.includes('peshawar')) return 'KPK';
  if (t.includes('balochistan') || t.includes('bctb') || t.includes('quetta')) return 'BALOCHISTAN';
  if (t.includes('ajk') || t.includes('azad jammu')) return 'AJK';
  return 'SINDH';
}

function detectSubject(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('biology'))                            return 'B';
  if (t.includes('physics'))                            return 'P';
  if (t.includes('chemistry'))                          return 'C';
  if (t.includes('mathematics') || t.includes(' math')) return 'M';
  if (t.includes('english'))                            return 'E';
  if (t.includes('computer science'))                   return 'CS';
  if (t.includes('urdu'))                               return 'U';
  if (t.includes('general science'))                    return 'S';
  if (t.includes('geography'))                          return 'GEO';
  if (t.includes('economics'))                          return 'ECO';
  if (t.includes('pakistan studies'))                   return 'PST';
  return 'B';
}

function normalizeGrade(raw: string): string {
  const t = (raw || '').trim().toUpperCase();
  if (ROMAN_TO_GRADE[t]) return ROMAN_TO_GRADE[t];
  const n = parseInt(t, 10);
  return isNaN(n) ? t : n.toString().padStart(2, '0');
}

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

interface RawSLO {
  slo_code: string | null;
  raw_code_as_found: string;
  slo_full_text: string;
  grade: string | null;
  domain: string | null;
  domain_name: string | null;
  benchmark: string | null;
  subject: string | null;
  subject_code: string;
  board: string;
  char_offset: number;
  page_number_estimate: number;
  is_truncated: boolean;
  is_orphan_domain: boolean;
  regex_confidence: number;
  extraction_confidence?: number;
}

// ═══════════════════════════════════════════════════════════════════════
// DEDUPLICATION
// BUG-1 FIX: moved outside POST(), preserves null-code SLOs
// ═══════════════════════════════════════════════════════════════════════

function deduplicateRecords(records: any[]): any[] {
  const seen = new Map<string, number>();

  return records.map(r => {
    // Build a stable unique key for BOTH coded and codeless SLOs
    const baseKey = r.slo_code != null
      ? `${r.document_id}:${r.slo_code}`
      // Codeless SLOs: key on first 80 chars of text so exact duplicates are dropped
      : `${r.document_id}:NULL:${(r.slo_full_text || '').substring(0, 80)}`;

    const count = seen.get(baseKey) ?? 0;
    seen.set(baseKey, count + 1);

    if (count === 0) return r; // first occurrence — keep as-is

    // Coded duplicates get a version suffix
    if (r.slo_code != null) {
      return { ...r, slo_code: `${r.slo_code}_v${count + 1}` };
    }

    // Codeless exact duplicate — drop it
    return null;
  }).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════
// CONFIDENCE SCORING
// ═══════════════════════════════════════════════════════════════════════

function computeConfidence(slo: RawSLO, isOcrReliable: boolean): number {
  const weights = { regex: 0.35, domain: 0.25, boundary: 0.20, ocr: 0.20 };
  return Math.round((
    (slo.regex_confidence                           * weights.regex) +
    ((!slo.is_orphan_domain ? 1.0 : 0.2)           * weights.domain) +
    ((slo.is_truncated ? 0.3 : 1.0)                * weights.boundary) +
    ((isOcrReliable ? 1.0 : 0.6)                   * weights.ocr)
  ) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════
// DOMAIN SCANNER (pre-pass)
// ═══════════════════════════════════════════════════════════════════════

function scanDeclaredDomains(text: string): Record<string, string> {
  const domains: Record<string, string> = {};
  const pattern = /(?:DOMAIN|STRAND)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const letter = m[1].toUpperCase();
    if (!domains[letter]) domains[letter] = m[2].trim().replace(/\s+/g, ' ');
  }
  return domains;
}

// ═══════════════════════════════════════════════════════════════════════
// JSON EXTRACTION HELPER
// ═══════════════════════════════════════════════════════════════════════

function extractJson(raw: string): any {
  if (!raw || raw.trim() === '') return { slos: [] };
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try extracting just the object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    return { slos: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PROCESS SLOs — normalize, recover metadata, NO fabricated GEN- codes
// BUG-2 FIX: null codes stay null, no GEN- fabrication
// ═══════════════════════════════════════════════════════════════════════

function processSlos(
  slos: any[],
  boardKey: string,
  subjectCode: string,
  declaredDomains: Record<string, string>
): RawSLO[] {
  const board = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS.SINDH;

  return slos.map((s: any): RawSLO => {
    // Normalize code — returns null for unrecognized codes (NO fabrication)
    const normalizedCode = s.slo_code ? board.normalizeFn(s.slo_code) : null;

    let grade  = s.grade  ? normalizeGrade(s.grade)            : null;
    let domain = s.domain ? s.domain.trim().toUpperCase() : null;

    // Sanitize domain to single letter
    if (domain && domain.length > 1) {
      const m = domain.match(/^([A-Z])/);
      domain = m ? m[1] : null;
    }

    let domainName = s.domain_name || null;

    // METADATA RECOVERY from normalized code
    // Pattern: [SUBJECT][2-digit grade][DOMAIN letter][2-digit number]
    if (normalizedCode) {
      const m = normalizedCode.match(/^[A-Z]{1,3}(\d{2})([A-Z])\d{2}$/);
      if (m) {
        if (!grade)      grade      = m[1];
        if (!domain)     domain     = m[2];
      }
    }

    // Domain name recovery from pre-scanned domains map
    if (domain && !domainName && declaredDomains[domain]) {
      domainName = declaredDomains[domain];
    }

    const isMissingDomain = !domainName;

    return {
      slo_code          : normalizedCode,           // BUG-2 FIX: null stays null
      raw_code_as_found : s.raw_code_as_found || s.slo_code || 'null',
      slo_full_text     : (s.slo_full_text || '').trim(),
      grade             : grade || null,
      domain            : domain || null,
      domain_name       : domainName,
      benchmark         : s.benchmark || null,
      subject           : s.subject || SUBJECT_CODES[subjectCode] || null,
      subject_code      : subjectCode,
      board             : boardKey,
      char_offset       : s.char_offset || 0,
      page_number_estimate: s.page_number_estimate || 0,
      is_truncated      : Boolean(s.is_truncated),
      is_orphan_domain  : isMissingDomain,
      regex_confidence  : normalizedCode ? 1.0 : 0.5,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════
// LLM EXTRACTION (SLIDING WINDOW)
// BUG-3 FIX: real model names
// BUG-4 FIX: guaranteed minimum chunk advance
// ═══════════════════════════════════════════════════════════════════════

async function llmExtract(
  text: string,
  boardKey: string,
  subjectCode: string,
  declaredDomains: Record<string, string>,
  feedbackExamples: any[] = []
): Promise<RawSLO[]> {

  const board       = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS.SINDH;
  const subjectName = SUBJECT_CODES[subjectCode] || 'Unknown';

  let feedbackBlock = '';
  if (feedbackExamples.length > 0) {
    feedbackBlock = '\n### FEEDBACK-DRIVEN CORRECTIONS:\n' +
      feedbackExamples
        .map(f => `INPUT: ${f.original_text}\nCORRECT OUTPUT: ${JSON.stringify(f.corrected_json)}`)
        .join('\n---\n');
  }

  const schema = {
    type: Type.OBJECT,
    properties: {
      slos: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            slo_code          : { type: Type.STRING,  nullable: true  },
            raw_code_as_found : { type: Type.STRING,  nullable: true  },
            slo_full_text     : { type: Type.STRING                   },
            grade             : { type: Type.STRING,  nullable: true  },
            domain            : { type: Type.STRING,  nullable: true  },
            domain_name       : { type: Type.STRING,  nullable: true  },
            benchmark         : { type: Type.STRING,  nullable: true  },
            subject           : { type: Type.STRING,  nullable: true  },
            subject_code      : { type: Type.STRING,  nullable: true  },
            board             : { type: Type.STRING,  nullable: true  },
            is_truncated      : { type: Type.BOOLEAN, nullable: true  },
            is_orphan_domain  : { type: Type.BOOLEAN, nullable: true  },
          },
          required: ['slo_full_text'],
        },
      },
    },
  };

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
  const ai     = new GoogleGenAI({ apiKey });

  const allRawSlos: any[]     = [];
  const seenFingerprints      = new Set<string>();
  let   offset                = 0;
  let   chunkIndex            = 0;

  while (offset < text.length) {
    chunkIndex++;

    // Smart boundary: try to end on a newline
    let end = Math.min(offset + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const searchRegion = text.substring(end - 1000, end);
      const lastNewline  = searchRegion.lastIndexOf('\n');
      if (lastNewline !== -1) end = (end - 1000) + lastNewline + 1;
    }

    const chunkText = text.substring(offset, end);
    console.log(`[Ingestion] Chunk ${chunkIndex}: offset=${offset}, length=${chunkText.length}`);

    const prompt = buildExtractionPrompt(chunkText, boardKey, subjectCode, subjectName, board.name, chunkIndex, feedbackBlock);

    try {
      let chunkSlos: any[] = [];

      // TIER 1: Primary model
      try {
        const response = await ai.models.generateContent({
          model   : MODEL_PRIMARY,                   // BUG-3 FIX
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config  : {
            responseMimeType : 'application/json',
            responseSchema   : schema,
            maxOutputTokens  : MAX_OUTPUT_TOKENS,
          },
        });
        const data = extractJson(response.text || '{"slos":[]}');
        chunkSlos  = data.slos || [];

      } catch (err: any) {
        const isQuota = err.message?.includes('429') ||
                        err.message?.includes('quota') ||
                        err.message?.includes('RESOURCE_EXHAUSTED');
        if (isQuota) {
          console.warn(`[Ingestion] Quota hit on chunk ${chunkIndex}, falling back to ${MODEL_FALLBACK}`);
          const response = await ai.models.generateContent({
            model   : MODEL_FALLBACK,                // BUG-3 FIX
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config  : {
              responseMimeType: 'application/json',
              responseSchema  : schema,
              maxOutputTokens : MAX_OUTPUT_TOKENS,
            },
          });
          const data = extractJson(response.text || '{"slos":[]}');
          chunkSlos  = data.slos || [];
        } else {
          throw err;
        }
      }

      // Deduplicate within the sliding window
      for (const s of chunkSlos) {
        if (!s.slo_full_text?.trim()) continue;
        const fp = createHash('md5')
          .update(`${s.slo_code ?? 'null'}|${s.slo_full_text}`)
          .digest('hex');
        if (!seenFingerprints.has(fp)) {
          seenFingerprints.add(fp);
          allRawSlos.push(s);
        }
      }

      console.log(`[Ingestion] Chunk ${chunkIndex}: got ${chunkSlos.length} SLOs (total so far: ${allRawSlos.length})`);

    } catch (chunkErr: any) {
      console.error(`[Ingestion] Chunk ${chunkIndex} failed:`, chunkErr.message);
      // Continue — don't abort the entire document for one bad chunk
    }

    // BUG-4 FIX: guaranteed minimum advance prevents infinite loops
    const rawNext = end - OVERLAP;
    offset        = Math.max(offset + MIN_ADVANCE, rawNext);

    if (offset >= MAX_TEXT_BYTES) break; // safety cap
  }

  console.log(`[Ingestion] Sliding window complete. Raw SLOs before processing: ${allRawSlos.length}`);
  return processSlos(allRawSlos, boardKey, subjectCode, declaredDomains);
}

// ═══════════════════════════════════════════════════════════════════════
// EXTRACTION PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════

function buildExtractionPrompt(
  chunkText  : string,
  boardKey   : string,
  subjectCode: string,
  subjectName: string,
  boardName  : string,
  chunkIndex : number,
  feedbackBlock: string
): string {
  return `You are an elite pedagogical data engineer specializing in Pakistani curriculum extraction for the ${boardName}.

Your sole task is to extract Student Learning Outcomes (SLOs) from this ${boardName} ${subjectName} curriculum document with zero hallucination and maximum fidelity.

═══════════════════════════════════════════════════════════
UNIVERSAL SLO CODE SYSTEM
═══════════════════════════════════════════════════════════

Code format: [SUBJECT][GRADE][DOMAIN][NUMBER]
Subject prefix for this document: "${subjectCode}" = ${subjectName}

GRADE CODES (2-digit output):
  IX→09, X→10, XI→11, XII→12

SLO NUMBER: always 2-digit padded: 1→01, 9→09, 10→10

NORMALIZED FORMAT (no dashes, no brackets):
  [SLO:${subjectCode}-09-A-01] → ${subjectCode}09A01
  ${subjectCode}-9-A-1         → ${subjectCode}09A01  (pad both)
  SL0:${subjectCode}-12-K-03   → ${subjectCode}12K03  (SL0 with zero = OCR)
  5L0:${subjectCode}-11-B-19   → ${subjectCode}11B19  (5L0 = OCR for SLO)
  ${subjectCode}IX-A-01        → ${subjectCode}09A01  (Roman numeral grade)
  ${subjectCode}XII-K-03       → ${subjectCode}12K03  (Roman numeral grade)

═══════════════════════════════════════════════════════════
OCR CORRECTION — APPLY IN ORDER
═══════════════════════════════════════════════════════════

1. Strip prefix:    [SLO:  SLO:  SL0:  5L0:  LO:
2. Strip wrappers:  [ ] ( ) :
3. Strip separators: all dashes, dots, spaces
4. Fix l→1: trailing lowercase l or I after digits → 1
5. Fix O→0: letter O in digit position → 0
6. Pad grade:  single digit → 2-digit (9→09)
7. Pad number: single digit → 2-digit (1→01)
8. Roman grade: IX→09, X→10, XI→11, XII→12

═══════════════════════════════════════════════════════════
PROGRESSION GRID TABLE HANDLING
═══════════════════════════════════════════════════════════

Curriculum documents use grade columns: Grade IX | Grade X | Grade XI | Grade XII
PDF extraction FLATTENS these columns left-to-right.
You MUST reconstruct which SLO belongs to which grade by:
1. Looking at the SLO code (most reliable)
2. Looking at column header proximity in the text
3. Looking at section headers above (e.g., "Grade – XI")

Extract ALL SLOs from ALL grade columns — never skip a column.
Where a column shows "N/A" → that domain has no SLOs for that grade.

═══════════════════════════════════════════════════════════
GRADE & DOMAIN DETECTION PRIORITY
═══════════════════════════════════════════════════════════

Grade (in priority order):
1. Explicit in SLO code itself     [SLO:${subjectCode}-11-B-05] → "11"
2. Section header                  "Grade – XI" → "11"
3. Benchmark header                "Benchmark 1: Grade XI" → "11"
4. Chapter header                  "IX Chapter 01" → "09"
5. Document title context
6. Cannot determine → null (NEVER guess)

Domain (in priority order):
1. Explicit in SLO code            [SLO:${subjectCode}-09-H-01] → "H"
2. DOMAIN heading                  "DOMAIN H: Form and Functions of Plants" → "H"
3. Benchmark section above SLO
4. Chapter title matches domain
5. Cannot determine → null

═══════════════════════════════════════════════════════════
BENCHMARK RULES
═══════════════════════════════════════════════════════════

- A benchmark applies to ALL SLOs following it until the NEXT benchmark
- Copy verbatim: "Benchmark 1: Students should be able to..."
- If no benchmark precedes an SLO → benchmark: null
- NEVER invent benchmark text

═══════════════════════════════════════════════════════════
TRUNCATION — mark is_truncated: true when
═══════════════════════════════════════════════════════════

- Text ends mid-sentence (no period/complete clause)
- Ends with a comma
- Ends with "e.g." "i.e." "such as" with nothing after
- Ends with opening parenthesis (
- Fewer than 8 words (likely PDF column break cut-off)

═══════════════════════════════════════════════════════════
CODELESS SLOs (preambles, aims, introductions)
═══════════════════════════════════════════════════════════

For SLOs in "After completing this curriculum students will be able to:" sections:
  slo_code: null
  raw_code_as_found: "null"
  is_orphan_domain: true
  grade: "09-12" if general, or specific grade if context allows

═══════════════════════════════════════════════════════════
ABSOLUTE PROHIBITIONS
═══════════════════════════════════════════════════════════

❌ NEVER invent an SLO code not present in the source text
❌ NEVER invent domain_name — only from document headings
❌ NEVER invent benchmark text — verbatim or null
❌ NEVER skip SLOs — extract all, even truncated
❌ NEVER merge two SLOs into one
❌ NEVER split one SLO into two
❌ NEVER alter slo_full_text — copy exactly as written
❌ NEVER use "N/A" or "Unknown" — use null

═══════════════════════════════════════════════════════════
OUTPUT — return ONLY valid JSON, no markdown fences
═══════════════════════════════════════════════════════════

{
  "slos": [
    {
      "slo_code": "${subjectCode}09A01",
      "raw_code_as_found": "[SLO:${subjectCode}-09-A-01]",
      "slo_full_text": "Exact text as written",
      "grade": "09",
      "domain": "A",
      "domain_name": "Domain name from document or null",
      "benchmark": "Verbatim benchmark or null",
      "subject": "${subjectName}",
      "subject_code": "${subjectCode}",
      "board": "${boardKey}",
      "is_truncated": false,
      "is_orphan_domain": false
    }
  ]
}

Sort output: grade ascending (09→12), then domain (A→Z), then SLO number (01→99).
Codeless SLOs (slo_code: null) go FIRST within their grade.

### CONTEXT:
- BOARD: ${boardKey}
- SUBJECT: ${subjectCode} (${subjectName})
- CHUNK: ${chunkIndex}
${feedbackBlock}

### TEXT TO PROCESS:
${chunkText}`;
}

// ═══════════════════════════════════════════════════════════════════════
// LEDGER MARKDOWN BUILDER
// Generates the clean, structured ledger that gets stored as extracted_text
// ═══════════════════════════════════════════════════════════════════════

function buildLedgerMarkdown(
  slos     : RawSLO[],
  boardKey : string,
  subjectCode: string
): string {
  const board       = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS.SINDH;
  const subjectName = SUBJECT_CODES[subjectCode] || 'General';

  // ── Sort: null-code SLOs first, then grade → domain → slo_number ──
  const sorted = [...slos].sort((a, b) => {
    // Codeless SLOs float to top within their grade bucket
    if (!a.slo_code && b.slo_code)  return -1;
    if (a.slo_code  && !b.slo_code) return  1;

    const gA = parseInt(a.grade || '99', 10) || 99;
    const gB = parseInt(b.grade || '99', 10) || 99;
    if (gA !== gB) return gA - gB;

    const dA = (a.domain || 'ZZ').toUpperCase();
    const dB = (b.domain || 'ZZ').toUpperCase();
    if (dA !== dB) return dA.localeCompare(dB);

    // Sort by SLO number extracted from the code
    const numA = parseInt((a.slo_code || '').slice(-2), 10) || 0;
    const numB = parseInt((b.slo_code || '').slice(-2), 10) || 0;
    return numA - numB;
  });

  // ── Debug log ──
  console.log('[Ledger] Sorted SLO order (first 20):',
    sorted.slice(0, 20).map(s => `${s.grade}-${s.domain}-${s.slo_code}`)
  );

  // ── Domain stats for structured index ──
  const domainStats: Record<string, { count: number; name: string | null }> = {};
  for (const s of sorted) {
    const key = `${s.grade || 'XX'}-${s.domain || 'X'}`;
    if (!domainStats[key]) domainStats[key] = { count: 0, name: s.domain_name || null };
    domainStats[key].count++;
  }

  // ── Build lines ──
  const lines: string[] = [];

  // Header block
  lines.push(`Board: ${board.name}`);
  lines.push(`Subject: ${subjectName}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total SLOs: ${sorted.length}`);
  lines.push('<!-- MASTER_MD_DIALECT: Institutional_Vault_v6 -->');
  lines.push('');

  // Summary table of contents
  lines.push('## DOMAIN SUMMARY');
  lines.push('');
  const grades = [...new Set(sorted.map(s => s.grade || 'IX-XII'))].sort();
  for (const grade of grades) {
    const gradeSlos = sorted.filter(s => s.grade === grade);
    const domains   = [...new Set(gradeSlos.map(s => s.domain || '?'))].sort();
    const domainList = domains.map(d => {
      const dSlos   = gradeSlos.filter(s => s.domain === d);
      const dName   = dSlos[0]?.domain_name;
      return dName ? `${d}:${dName}(${dSlos.length})` : `${d}(${dSlos.length})`;
    }).join(', ');
    lines.push(`Grade ${grade}: ${domainList}`);
  }
  lines.push('');

  // Main ledger body
  let lastGrade  = '';
  let lastDomain = '';

  for (const s of sorted) {
    const currentGrade  = s.grade  || 'IX-XII';
    const currentDomain = (s.domain || 'GENERAL').toUpperCase();

    // Grade header
    if (currentGrade !== lastGrade) {
      lines.push('');
      lines.push(`# GRADE ${currentGrade}`);
      lines.push('');
      lastGrade  = currentGrade;
      lastDomain = '';
    }

    // Domain header
    if (currentDomain !== lastDomain) {
      const domainName = s.domain_name ? `: ${s.domain_name}` : '';
      lines.push('');
      lines.push(`### DOMAIN ${currentDomain}${domainName}`);
      lines.push('');
      lastDomain = currentDomain;
    }

    // SLO line — the core ledger entry
    if (s.slo_code) {
      // Coded SLO: "SLO B09A01 Exact text here"
      const truncFlag = s.is_truncated ? ' [TRUNCATED]' : '';
      lines.push(`SLO ${s.slo_code} ${s.slo_full_text}${truncFlag}`);
    } else {
      // Codeless SLO: "[GENERAL] Exact text here"
      lines.push(`[GENERAL] ${s.slo_full_text}`);
    }
  }

  lines.push('');
  lines.push('');

  // Structured index block for RAG metadata filtering
  // Lets the vector retriever filter by grade/domain without parsing text
  const structuredIndex = {
    board      : boardKey,
    subject    : subjectCode,
    subjectName: subjectName,
    grades     : grades,
    domains    : [...new Set(sorted.map(s => s.domain).filter(Boolean))].sort(),
    totalSlos  : sorted.length,
    domainMap  : Object.fromEntries(
      sorted
        .filter(s => s.domain && s.domain_name)
        .map(s => [s.domain!, s.domain_name!])
        .filter((v, i, arr) => arr.findIndex(x => x[0] === v[0]) === i)
    ),
    gradeStats : Object.fromEntries(
      grades.map(g => [
        g,
        {
          count  : sorted.filter(s => s.grade === g).length,
          domains: [...new Set(sorted.filter(s => s.grade === g).map(s => s.domain).filter(Boolean))].sort(),
        }
      ])
    ),
  };

  lines.push('<STRUCTURED_INDEX>');
  lines.push(JSON.stringify(structuredIndex, null, 2));
  lines.push('</STRUCTURED_INDEX>');

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════

export async function POST(
  req   : NextRequest,
  props : { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const adminSupabase  = getSupabaseAdminClient();
  const queue          = new IngestionQueue(adminSupabase);

  let job = await queue.getJobStatus(documentId).catch(() => null);
  if (!job) {
    const jobId = await queue.enqueue(documentId);
    job = { id: jobId, step: IngestionStep.EXTRACT };
  }

  if (job.step === IngestionStep.COMPLETE) {
    return NextResponse.json({ success: true, done: true, step: 'COMPLETE', progress: 100 });
  }

  try {
    const { data: doc } = await adminSupabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (!doc) throw new Error('VAULT_ERROR: Document not found.');

    // ══════════════════════════════════════════════════════════════════
    // STAGE 1 — EXTRACT
    // ══════════════════════════════════════════════════════════════════
    if (job.step === IngestionStep.EXTRACT) {
      await queue.updateProgress(job.id, {
        step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching from storage...',
      });

      const r2Path = doc.file_path;
      if (!r2Path) throw new Error('R2_FAULT: No file path stored.');

      const buffer = await getObjectBuffer(r2Path);
      if (!buffer)  throw new Error('R2_FAULT: File unreachable.');

      await queue.updateProgress(job.id, {
        step: IngestionStep.EXTRACT, progress: 18, message: 'Parsing PDF...',
      });

      const parseResult = await pdf(buffer);
      const text        = parseResult.text?.trim() || '';
      console.log(`[Stage 1] PDF extracted for ${documentId}: ${text.length} chars`);

      if (text.length < 300) throw new Error('PDF extraction failed — too little text.');

      const sample          = (doc.name || '') + ' ' + text.substring(0, 2000);
      const detectedBoard   = detectBoard(sample);
      const detectedSubject = detectSubject(sample);
      const estimatedPages  = Math.ceil(text.length / 2000);

      await adminSupabase.from('documents').update({
        extracted_text  : text,
        document_summary: `Extracted|board:${detectedBoard}|subject:${detectedSubject}|pages:~${estimatedPages}`,
        status          : 'processing',
      }).eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE, progress: 30, message: 'Linearizing Curriculum...',
      });
      job = await queue.getJobStatus(documentId);
    }

    // ══════════════════════════════════════════════════════════════════
    // STAGE 2 — LINEARIZE (Extract SLOs → Build Ledger)
    // ══════════════════════════════════════════════════════════════════
    if (job.step === IngestionStep.LINEARIZE) {
      console.log(`[Stage 2] Starting LINEARIZE for ${documentId}`);

      const { data: current } = await adminSupabase
        .from('documents')
        .select('extracted_text, document_summary')
        .eq('id', documentId)
        .single();

      const rawText     = current?.extracted_text || '';
      const summaryMeta = current?.document_summary || '';
      const boardKey    = summaryMeta.match(/board:(\w+)/)?.[1]        || 'SINDH';
      const subjectCode = summaryMeta.match(/subject:([A-Z]+)/)?.[1]   || 'B';

      console.log(`[Stage 2] Board: ${boardKey}, Subject: ${subjectCode}, Text: ${rawText.length} chars`);
      console.log(`[Stage 2] Estimated chunks: ${Math.ceil(rawText.length / MIN_ADVANCE)}`);

      // OCR reliability check
      const nonEmptyLines  = rawText.split('\n').filter((l: string) => l.trim().length > 0);
      const avgLineLength  = nonEmptyLines.reduce((s: number, l: string) => s + l.length, 0) / (nonEmptyLines.length || 1);
      const isOcrReliable  = avgLineLength > 30 && rawText.length > 500;

      // Pre-scan declared domains
      const declaredDomains = scanDeclaredDomains(rawText);
      console.log(`[Stage 2] Declared domains:`, Object.keys(declaredDomains));

      // Fetch feedback examples for learning
      const { data: feedback } = await adminSupabase
        .from('slo_feedback')
        .select('original_text, corrected_json')
        .order('created_at', { ascending: false })
        .limit(10);

      // ── Run AI extraction ──
      const rawSLOs = await llmExtract(rawText, boardKey, subjectCode, declaredDomains, feedback || []);
      console.log(`[Stage 2] llmExtract returned ${rawSLOs.length} raw SLOs`);

      // ── Score confidence ──
      const scoredSLOs: RawSLO[] = rawSLOs.map(slo => ({
        ...slo,
        extraction_confidence: computeConfidence(slo, isOcrReliable),
      }));

      // ── Debug distribution ──
      const domainDist = scoredSLOs.reduce((acc, s) => {
        const k = `G${s.grade || '??'}-D${s.domain || '??'}`;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log('[Stage 2] Domain distribution:', JSON.stringify(domainDist));
      console.log('[Stage 2] Grades found:',
        [...new Set(scoredSLOs.map(s => s.grade))].sort());
      console.log('[Stage 2] Domains found:',
        [...new Set(scoredSLOs.map(s => s.domain))].sort());
      console.log('[Stage 2] Truncated SLOs:',
        scoredSLOs.filter(s => s.is_truncated).length);
      console.log('[Stage 2] Null codes (codeless SLOs):',
        scoredSLOs.filter(s => !s.slo_code).length);

      // ── Build DB records ──
      if (scoredSLOs.length > 0) {
        const records = scoredSLOs.map(s => ({
          document_id          : documentId,
          slo_code             : s.slo_code,       // BUG-2 FIX: null is stored as null
          slo_full_text        : s.slo_full_text,
          domain               : s.domain,
          domain_name          : s.domain_name,
          bloom_level          : 'Understand',      // Stage 3 will update this
          subject              : s.subject,
          grade_level          : s.grade,
          extraction_confidence: s.extraction_confidence,
          page_number          : s.page_number_estimate || null,
          is_truncated         : s.is_truncated,
          is_orphan_domain     : s.is_orphan_domain,
          raw_code_as_found    : s.raw_code_as_found,
          char_offset          : s.char_offset,
          benchmark            : s.benchmark,
          board                : s.board,
        }));

        // BUG-1 FIX: deduplicateRecords is now outside POST() and preserves null-code SLOs
        const dedupedRecords = deduplicateRecords(records);
        console.log(`[Stage 2] Deduped records: ${dedupedRecords.length} (from ${records.length})`);

        // Clear old records for this document
        await adminSupabase
          .from('slo_database')
          .delete()
          .eq('document_id', documentId);

        // For null slo_code records, we need a different conflict strategy
        // Split into coded and codeless for upsert handling
        const codedRecords    = dedupedRecords.filter(r => r.slo_code != null);
        const codelessRecords = dedupedRecords.filter(r => r.slo_code == null);

        if (codedRecords.length > 0) {
          const { error: upsertError } = await adminSupabase
            .from('slo_database')
            .upsert(codedRecords, { onConflict: 'document_id,slo_code' });
          if (upsertError) {
            console.error('[Stage 2] Coded upsert error:', JSON.stringify(upsertError));
            throw new Error(`DB_FAULT: ${upsertError.message}`);
          }
        }

        if (codelessRecords.length > 0) {
          // Codeless SLOs: plain insert (no conflict key possible without slo_code)
          const { error: insertError } = await adminSupabase
            .from('slo_database')
            .insert(codelessRecords);
          if (insertError) {
            // Non-fatal: log and continue
            console.warn('[Stage 2] Codeless insert warning:', JSON.stringify(insertError));
          }
        }

        console.log(`[Stage 2] DB write complete: ${codedRecords.length} coded + ${codelessRecords.length} codeless`);
      } else {
        console.warn(`[Stage 2] No SLOs extracted for ${documentId}`);
      }

      // ── Build the Ledger Markdown ──
      const ledgerMarkdown = buildLedgerMarkdown(scoredSLOs, boardKey, subjectCode);
      console.log(`[Stage 2] Ledger markdown built: ${ledgerMarkdown.length} chars`);

      // Persist ledger (or preserve raw text if extraction failed completely)
      if (scoredSLOs.length > 0) {
        await adminSupabase.from('documents').update({
          extracted_text  : ledgerMarkdown,
          document_summary: `Ledger|slos:${scoredSLOs.length}|board:${boardKey}|subject:${subjectCode}`,
        }).eq('id', documentId);
        console.log(`[Stage 2] Ledger saved to documents.extracted_text`);
      } else {
        console.warn(`[Stage 2] Zero SLOs — preserving raw text, not overwriting.`);
        await adminSupabase.from('documents').update({
          document_summary: `Ledger|slos:0|raw_preserved|board:${boardKey}|subject:${subjectCode}`,
        }).eq('id', documentId);
      }

      await queue.updateProgress(job.id, {
        step   : IngestionStep.ENRICH,
        progress: 60,
        message : 'Classifying Bloom Taxonomy...',
      });
      job = await queue.getJobStatus(documentId);
    }

    // ══════════════════════════════════════════════════════════════════
    // STAGE 3 — ENRICH (Bloom Taxonomy)
    // ══════════════════════════════════════════════════════════════════
    if (job.step === IngestionStep.ENRICH) {
      console.log(`[Stage 3] Starting ENRICH for ${documentId}`);
      // TODO: Implement real Bloom classification here
      // For now, progress to EMBED
      await queue.updateProgress(job.id, {
        step   : IngestionStep.EMBED,
        progress: 75,
        message : 'Building Neural Index...',
      });
      job = await queue.getJobStatus(documentId);
    }

    // ══════════════════════════════════════════════════════════════════
    // STAGE 4 — EMBED
    // ══════════════════════════════════════════════════════════════════
    if (job.step === IngestionStep.EMBED) {
      console.log(`[Stage 4] Starting EMBED for ${documentId}`);

      const { data: finalDoc } = await adminSupabase
        .from('documents')
        .select('extracted_text')
        .eq('id', documentId)
        .single();

      const textToEmbed = finalDoc?.extracted_text || '';
      if (textToEmbed.length >= 100) {
        await indexDocumentForRAG(documentId, textToEmbed, adminSupabase, job.id);
      } else {
        console.warn(`[Stage 4] Text too short to embed (${textToEmbed.length} chars)`);
      }

      await queue.markComplete(job.id);
      await adminSupabase.from('documents').update({
        status          : 'ready',
        rag_indexed     : true,
        document_summary: 'Neural grid verified. Ledger active.',
      }).eq('id', documentId);

      console.log(`[Stage 4] EMBED complete for ${documentId}`);
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    const msg = err.message || 'Processing failed.';
    console.error(`[Engine v6.0] Fatal error for ${documentId}:`, msg);
    try { await queue.markFailed(job.id, msg); }    catch (_) {}
    try {
      await adminSupabase.from('documents').update({
        status          : 'failed',
        document_summary: msg.substring(0, 500),
      }).eq('id', documentId);
    } catch (_) {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
