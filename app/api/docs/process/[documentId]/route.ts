// app/api/docs/process/[documentId]/route.ts
// PEDAGOGY MASTER AI — Ingestion Engine v6.3
// FIXES: Math (M) curriculum support — horizontal SLO table, grades I-VIII, OCR in grade position

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep } from '../../../../../types';
import { IngestionQueue } from '../../../../../lib/jobs/ingestion-queue';
import pdf from 'pdf-parse';
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from 'openai';
import { createHash } from 'crypto';
import { resolveApiKey } from '../../../../../lib/env-server';
import { extractSLOsFromPDFBuffer, likelyHasMultiGradeTable } from '../../../../../lib/slo/table-extractor';
import { saveExtractionPattern, getBestMatchingPattern, buildPatternAwarePrompt, type ExtractionPattern } from '../../../../../lib/slo/pattern-trainer';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ── CONFIG ────────────────────────────────────────────────────────────────────
const MODEL_PRIMARY  = 'gemini-2.0-flash';
const MODEL_LITE     = 'gemini-2.0-flash-lite';
const MODEL_FALLBACK = 'gemini-2.0-flash-lite';

const CHUNK_SIZE  = 10000;
const OVERLAP     = 2500;
const MIN_ADVANCE = 5000;

// ── LOOKUP TABLES ─────────────────────────────────────────────────────────────
const ROMAN: Record<string, string> = {
  I:'01', II:'02', III:'03', IV:'04', V:'05', VI:'06',
  VII:'07', VIII:'08', IX:'09', X:'10', XI:'11', XII:'12',
  XIII:'13', XIV:'14', XV:'15'
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
  NCP:'National Curriculum of Pakistan (NCP)',
};

// ── DETECTION ─────────────────────────────────────────────────────────────────
function detectBoard(t: string): string {
  t = t.toLowerCase();
  if (t.includes('sindh') || t.includes('jamshoro') || t.includes('stbb')) return 'SINDH';
  if (t.includes('punjab') || t.includes('pctb') || t.includes('lahore'))    return 'PUNJAB';
  if (t.includes('federal') || t.includes('fbise') || t.includes('islamabad'))  return 'FBISE';
  if (t.includes('kpk') || t.includes('khyber') || t.includes('peshawar') || t.includes('kpcc'))     return 'KPK';
  if (t.includes('balochistan') || t.includes('quetta') || t.includes('btbb'))                      return 'BALOCHISTAN';
  if (t.includes('ajk') || t.includes('muzaffarabad'))                              return 'AJK';
  if (t.includes('ncp') || t.includes('national curriculum') || t.includes('single national') || t.includes('snc') || t.includes('pakistan')) return 'NCP';
  return 'NCP'; // NCP is the most universal fallback for Pakistan
}
function detectSubject(t: string): string {
  t = t.toLowerCase();
  
  if (t.includes('general science'))                       return 'S';
  if (t.includes('computer science'))                      return 'CS';
  if (t.includes('pakistan studies') || t.includes('civics')) return 'PST';
  if (t.includes('islamic studies') || t.includes('islamiat') || t.includes('islamic')) return 'ISL';
  
  if (t.includes('mathematics') || /\bmath\b/.test(t))     return 'M';
  if (t.includes('biology'))                               return 'B';
  if (t.includes('chemistry'))                             return 'C';
  if (t.includes('physics'))                               return 'P';
  if (t.includes('english'))                               return 'E';
  if (t.includes('urdu'))                                  return 'U';
  if (t.includes('geography') || t.includes('geographical')) return 'GEO';
  if (t.includes('economics') || t.includes('economic'))   return 'ECO';
  if (t.includes('history') || t.includes('historical'))   return 'HIS';

  // Universal dynamic extraction heuristic for unrecognized subjects:
  // e.g. "Curriculum for Sociology", "Syllabus of Psychology"
  const dynamicMatch = t.match(/curriculum (?:for|of)\s+([a-z\s]{3,30})/gi) || 
                       t.match(/syllabus (?:for|of)\s+([a-z\s]{3,30})/gi);
  if (dynamicMatch) {
    for (const match of dynamicMatch) {
      const parts = match.replace(/^(?:curriculum|syllabus)\s+(?:for|of)\s+/i, '').trim().toUpperCase().split(/\s+/);
      const firstWord = parts[0];
      if (firstWord && firstWord.length >= 3 && firstWord.length <= 15 && !['THE', 'FOR', 'AND', 'WITH', 'GRADE', 'CLASS'].includes(firstWord)) {
        console.log(`[detectSubject] Dynamically extracted custom subject code: ${firstWord}`);
        return firstWord;
      }
    }
  }

  console.warn(`[detectSubject] Could not identify subject from text sample. Defaulting to GEN.`);
  return 'GEN';
}
function normalizeGrade(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw !== 'string') raw = String(raw).trim();
  const t = raw.toUpperCase().replace(/\s+/g, ' ');
  
  // 1. Direct lookup in ROMAN map
  if (ROMAN[t]) return ROMAN[t];
  
  // 2. Extract roman numerals as word if any exist
  const romanWordMatch = t.match(/\b(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV)\b/);
  if (romanWordMatch && romanWordMatch[1] && ROMAN[romanWordMatch[1]]) {
    return ROMAN[romanWordMatch[1]];
  }

  // 3. Match any explicit digit
  const digitMatch = t.match(/\d+/);
  if (digitMatch) {
    const num = parseInt(digitMatch[0], 10);
    if (!isNaN(num) && num >= 0 && num <= 15) {
      return num.toString().padStart(2, '0');
    }
  }

  // 4. Kindergarten / Nursery / Early Childhood Education
  if (t.includes('KG') || t.includes('KINDERGARTEN') || t.includes('NURSERY') || t.includes('ECE') || t === 'K' || t === 'PRE-I') {
    return '00';
  }

  return null;
}

// ── SLO CODE NORMALIZER ───────────────────────────────────────────────────────
// Handles every variant found across all Sindh Board curricula:
//   Math:     [SLO:M-01-A-0l] → M01A01   grades I-VIII (01-08)
//   Science:  [SLO:C-09-A-02] → C09A02   grades IX-XII (09-12)
//   OCR:      0l or 0I in any position → 01
//   SW prefix, SL0/5L0 typos, grade range codes, unpadded grades
function normalizeCode(raw: any, subjectCode?: string): string | null {
  if (!raw || raw === 'null') return null;
  if (typeof raw !== 'string') raw = String(raw);

  let s = raw.toUpperCase()
    .replace(/^\[?(?:5L0|SL[O0]|LO|SW|SLO)\s*[:\s]*/i, '')
    .replace(/[\[\]():]/g, '')
    .replace(/[.\s]/g, '')
    .trim();

  // Grade-range codes: M-01-02-A-01 (cross-grade benchmarks) → take first grade
  const gradeRange = s.match(/^([A-Z]{1,4})-?(\d{2})-(\d{2})-?([A-Z])-?(\d{1,3})$/);
  if (gradeRange) {
    s = `${gradeRange[1]}${gradeRange[2]}${gradeRange[4]}${gradeRange[5].padStart(2, '0')}`;
  }

  s = s.replace(/-/g, ''); // remove all dashes

  // ── OCR fixes (applied before matching) ──────────────────────────────────
  // BUG FIX: Added /g flag to ALL replace() calls here.
  // Without /g, only the FIRST occurrence of each OCR error is fixed.
  // A string like "CS0LA0I" (two errors) only had the first fixed → "CS01A0I".
  // The second OCR error "0I" (zero-I = 01) was left unfixed, producing "CS01A0I"
  // instead of the correct "CS01A01".

  // Fix 0l / 0L / 0I in GRADE position: M0LA09 → M01A09
  s = s.replace(/([A-Z]{1,4})0[LI]([A-Z])/g, '$101$2');

  // Fix 0l / 0L / 0I at END of string (SLO number position)
  s = s.replace(/0[LI]$/g, '01');

  // Fix trailing l or I (SLO number): B09A0l → B09A01
  s = s.replace(/[LI]$/g, '1');

  // Fix O in digit positions: AO1 → A01
  s = s.replace(/([A-Z])O(\d)/g, '$10$2');
  s = s.replace(/(\d)O(\d)/g, '$10$2');

  // Roman numeral grade embedded in code: MVIIIA01 → M08A01
  const romMatch = s.match(/^([A-Z]{1,4})(XII|XI|IX|X|VIII|VII|VI|V|IV|III|II)([A-Z])(\d{1,3})$/);
  if (romMatch) {
    s = `${romMatch[1]}${ROMAN[romMatch[2]] ?? romMatch[2]}${romMatch[3]}${romMatch[4].padStart(2, '0')}`;
  }

  // Standard pattern: M01A01 or C09A01
  const numMatch = s.match(/^([A-Z]{1,4})(\d{1,2})([A-Z])(\d{1,3})$/);
  if (numMatch) {
    const sloNum = numMatch[4].startsWith('00') ? numMatch[4].slice(-2) : numMatch[4].padStart(2, '0');
    s = `${numMatch[1]}${numMatch[2].padStart(2, '0')}${numMatch[3]}${sloNum}`;
    
    // ENFORCE SUBJECT CODE: If the extracted subject part doesn't match the actual subjectCode, override it.
    // E.g. AI gives "O04A26" but subjectCode is "S" -> change to "S04A26"
    // E.g. AI gives "M04B05" but subjectCode is "S" -> change to "S04B05"
    if (subjectCode && numMatch[1] !== subjectCode) {
      s = `${subjectCode}${s.substring(numMatch[1].length)}`;
    }
    
    return s;
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
  const codeRe = /(?:\[?\s*(?:(?:5L0|SL[O0]|LO|SW|SLO)\s*[:\s]+)?([A-Z]{1,4})\s*[-\s]*\d{1,2}\s*[-\s]*[A-Z]\s*[-\s]*\d{1,2}[lI0-9]*\s*\]?)/gi;

  const matches = [...text.matchAll(codeRe)].map(m => ({
    start: m.index!,
    end: m.index! + m[0].length,
    raw: m[0]
  }));

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
    
    // Safety: don't take more than 3000 chars for a group text to avoid massive duplication
    const groupTextEnd = Math.min(nextGroupStart, group.end + 3000);
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
    if (!map[l]) {
      let rawName = m[2].trim().replace(/\s+/g, ' ');
      // Clean up common bleeding text from tables
      rawName = rawName.split(/Grade\s*[-–]?\s*[IVX]+/i)[0].trim();
      map[l] = rawName;
    }
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

// ── NON-SLO FILTER ───────────────────────────────────────────────────────────
/**
 * Prevents administrative text and glossary entries from becoming SLOs.
 */
function isLikelyNonSLO(text: string): boolean {
  if (!text || text.trim().length < 12) return true;

  const t = text.toLowerCase().trim();

  // Administrative/committee patterns
  if (/\b(committee|review committee)\s+shall/.test(t)) return true;
  if (/\b(directorate|government of sindh|school education)\b/.test(t)) return true;
  if (/(textbook\s+(should|development|writing|evaluation))/.test(t)) return true;

  // Document structure text
  if (/^(note:|s\.\s*no\.|ethical and social|theme no\.)/.test(t)) return true;
  if (/^\d+\s*\|\s*p\s*a\s*g\s*e/.test(t)) return true;
  if (/(approaches\s+to\s+teaching|methods and strategies)/.test(t)) return true;

  // Glossary entries (Term: Definition pattern)
  if (/^[a-z][a-z\s]{2,30}:\s+[A-Z]/.test(text)) return true;
  if (/^(apposition|appropriate|aspect|aside|authentic|autonomy|brainstorm|benchmark|chronological|coherence|cohesion|competency|comprehension|context|curriculum|deductive|descriptive|discourse):/.test(t)) return true;

  // Benchmark header rows (not SLOs themselves)
  if (/^benchmark:\s+/.test(t)) return true;

  // Must have at least one Bloom's-level action verb
  const bloomVerbs = [
    'identify','recognize','read','write','use','demonstrate','apply','analyze',
    'evaluate','create','describe','explain','express','develop','articulate',
    'comprehend','locate','compare','contrast','predict','summarize','retell',
    'recite','match','listen','speak','compose','revise','edit','construct',
    'infer','deduce','guess','find','select','choose','arrange','trace','copy',
    'fill','hold','enjoy','repeat','show','talk','share','take','produce',
    'respond','practice','participate','pronounce','name','distinguish',
    'interpret','transform','change','gather','locate','relate','seek',
    'connect','integrate','organize','classify','categorize','discuss',
    'solve', 'calculate', 'simplify', 'estimate', 'measure', 'round', 'factor', 'expand'
  ];

  return !bloomVerbs.some(v => t.includes(v));
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

    // Strip leading bracket/punctuation artifacts like "]", "]" with space, etc.
    let cleanedText = s.slo_full_text.trim()
      .replace(/^[\s\]\)\.\,\-\/\:\|]+/g, '')
      .trim();

    if (!cleanedText) continue;

    if (isLikelyNonSLO(cleanedText)) {
      console.log(`[Filter] Skipped non-SLO: "${cleanedText.substring(0, 60)}"`);
      continue;
    }

    const code = normalizeCode(s.slo_code, subjectCode);
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
      slo_full_text     : cleanedText,
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
  // Enhanced Regex: Handles [SLO:M-09-A-01], SLO M-09-A-01, M09A01, M-09-01, etc.
  const codeRe = /(?:\[?\s*(?:(?:5L0|SL[O0]|LO|SW|SLO)\s*[:\s]+)?([A-Z]{1,4})\s*[-\s]*(\d{1,2}|I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\s*[-\s]*([A-Z])\s*[-\s]*\d{1,2}[lI0-9]*\s*\]?)/gi;
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
  isDeep: boolean = false,
  pattern: ExtractionPattern | null = null
): string {
  const gradeSection = `
=== GRADE SYSTEM (Universal - Early Years through Grade XII/XIII+) ===
This is a universal curriculum framework supporting ANY grade level or stage of learning.
Grade mapping guidelines:
- Early Childhood Education / Nursery / Kindergarten / Prep (e.g., ECE, Nursery, KG, Prep, Pre-I) → '00'
- Primary Grades (e.g., Grades I to VIII / 1 to 8) → '01' to '08' (e.g., I→01, II→02, III→03, IV→04, V→05, VI→06, VII→07, VIII→08)
- Secondary & Higher Secondary Grades (e.g., Grades IX to XII / 13 / 9 to 13) → '09' to '13' (e.g., IX→09, X→10, XI→11, XII→12, XIII→13)
- ALWAYS extract the exact original grade/class text and normalize it internally to a 2-digit, zero-padded string representation.`;

  const patternContext = pattern ? `
=== LEARNED PATTERN FROM PREVIOUS SUCCESSFUL EXTRACTION ===
Board: ${pattern.board} | Subject: ${pattern.subject} | Grade Range: ${pattern.grade_range}
SLO Format: ${pattern.slo_format}
Column Structure: ${pattern.column_structure}
Domain Map: ${JSON.stringify(pattern.competency_domain_map)}
Sample Codes: ${pattern.sample_codes.join(', ')}

IMPORTANT: This document follows the above pattern. Apply it when extracting SLOs.
Skip these sections (not SLOs): ${pattern.non_slo_sections.join(', ')}
` : '';

  return `IDENTITY: Pedagogy Master AI (Orchestrator)
GOAL: Clean and format the following raw SLO blocks into the Universal JSON schema.
Board: ${board} | Subject: ${subject} | Chunk: ${chunkN}

${gradeSection}
${patternContext}

=== SLO FORMAT ===
Code: [SUB][GRADE][DOMAIN][NUM] (e.g. ${subjectCode}09A01)
JSON Fields:
- slo_code: Canonical 6-char code
- raw_code_as_found: The exact code/number from the text
- slo_full_text: The complete, accurate description text
- grade: The grade of the SLO, always a 2-digit number (e.g. 09, 10, etc.)
- domain: The single alphabetical character representing the domain
- domain_name: The name of the domain
- subject: The name of the subject

=== RULES ===
${isDeep ? '- Scan the text and extract ANY Student Learning Outcomes (SLOs) you find. Ignore junk text, table of contents, and introductions. FOCUS ONLY ON SLO CODES AND DESCRIPTIONS.' : '- You are receiving pre-filtered text that ONLY contains SLO codes and their descriptions.'}
- DANGER: Do NOT invent, rewrite, or paraphrase. The "slo_full_text" must exactly represent the document content.
- CLEANUP: Strictly REMOVE document artifacts like "Sindh Curriculum for Physics", page numbers (e.g., "54"), or "Grade IX Grade X" headers from the SLO text.
- MATH: Normalize math symbols. If you see Unicode artifacts like "푉", "푝", "푞", convert them to their logical letters "V", "p", "q".
- If a block is not an SLO (administrative text or glossary), omit it from JSON.
- Fix manifest OCR typos but keep terminology identical.
- Return ONLY raw JSON in the specified schema.

=== RAW TEXT ===
${chunk}`;
}

// ── AI CHAIN ORCHESTRATOR ─────────────────────────────────────────────────────
/**
 * Orchestrates a chain of AI models with safe fallbacks.
 * Tries Gemini models first, then falls back to Groq/OpenAI if needed.
 */
async function callAIChain(
  geminiKey: string,
  prompt: string,
  schema?: any,
  responseMimeType: 'application/json' | 'text/plain' = 'application/json'
): Promise<any> {
  const chain = [
    // PRIMARY: Gemini Flash — 60 RPM / 1500 RPD free tier. Best for bulk extraction.
    { provider: 'gemini', model: MODEL_PRIMARY, key: geminiKey },
    // FALLBACK 1: Flash Lite — even higher quota, slightly lower quality
    { provider: 'gemini', model: MODEL_LITE, key: geminiKey },
    // FALLBACK 2: Groq (Llama 3.3 70B) — very fast, high free quota
    { provider: 'groq', model: 'llama-3.3-70b-versatile', key: process.env.GROQ_API_KEY },
    // FALLBACK 3: Groq small model
    { provider: 'groq', model: 'llama-3.1-8b-instant', key: process.env.GROQ_API_KEY },
    // FALLBACK 4: OpenAI mini
    { provider: 'openai', model: 'gpt-4o-mini', key: process.env.OPENAI_API_KEY },
  ].filter(link => !!link.key);
  // REMOVED: { provider: 'gemini', model: MODEL_COMPLEX, key: geminiKey }
  // (gemini-2.5-pro-preview has 10 RPM on free tier — not suitable for bulk extraction)

  if (chain.length === 0) {
    throw new Error('ORCHESTRATOR_FAULT: No AI provider keys found in environment.');
  }

  for (const link of chain) {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        console.log(`[AI Chain] Trying ${link.provider}:${link.model} (Attempt ${attempts + 1}/${maxAttempts})`);
        
        let textResult = '';
        if (link.provider === 'gemini') {
          const ai = new GoogleGenAI({ apiKey: link.key! });
          const response = await ai.models.generateContent({
            model: link.model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              responseMimeType,
              responseSchema: schema,
              temperature: 0.1,
            }
          });
          textResult = response.text || '';
        } else {
          const openai = new OpenAI({ 
            apiKey: link.key!, 
            baseURL: link.provider === 'groq' ? 'https://api.groq.com/openai/v1' : undefined 
          });
          const completion = await openai.chat.completions.create({
            model: link.model,
            messages: [{ role: 'user', content: prompt }],
            response_format: responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
          });
          textResult = completion.choices[0].message.content || '';
        }

        if (responseMimeType === 'application/json') {
          const parsed = safeJson(textResult);
          if (parsed && (Object.keys(parsed).length > 0 || Array.isArray(parsed) || parsed.slos || parsed.enrichments)) {
             return parsed;
          }
        } else if (textResult.trim()) {
          return textResult;
        }
        
        console.warn(`[AI Chain] ${link.model} returned empty/invalid result. Trying next...`);
        break; 

      } catch (e: any) {
        attempts++;
        const isQuota = /429|quota|RESOURCE_EXHAUSTED/i.test(e.message || '');
        if (isQuota && attempts < maxAttempts) {
          console.warn(`[AI Chain] ${link.model} quota hit. Retrying in 2s...`);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        console.error(`[AI Chain] ${link.model} failed:`, e.message);
        break; 
      }
    }
  }

  throw new Error('AI_CHAIN_FAILURE: All models in the fallback chain failed to produce a valid response.');
}

// ── AI ORCHESTRATOR (Grok, Mistral, OpenAI, Gemini, etc.) ──────────────────────────
async function callAIOrchestrator(apiKey: string, text: string, schema: any, subject: string, subjectCode: string, board: string, chunkN: number, isDeep: boolean = false, pattern: ExtractionPattern | null = null): Promise<any[]> {
  const prompt = makePrompt(text, subject, subjectCode, board, chunkN, isDeep, pattern);
  try {
    const data = await callAIChain(apiKey, prompt, schema);
    if (Array.isArray(data.slos)) {
      console.log(`[Orchestrator] Success: ${data.slos.length} SLOs found in chunk ${chunkN}`);
      return data.slos;
    }
    return [];
  } catch (e: any) {
    console.error(`[Orchestrator] Fatal error for chunk ${chunkN}:`, e.message);
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

  // Pattern Memory: Try to find a matching pattern for this board + subject
  const pattern = await getBestMatchingPattern(supabase, boardKey, subjectName);
  if (pattern) {
    console.log(`[Extract] Using pattern memory for ${boardKey}/${subjectName} to guide extraction.`);
  }

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

  // FIX-BUG-07: Hydrate seenCodes from DB to prevent duplicates on job resume
  const { data: existingSlos } = await supabase
    .from('slo_database')
    .select('slo_code')
    .eq('document_id', documentId)
    .not('slo_code', 'is', null);

  const seenCodes = new Set<string>(
    (existingSlos || []).map((r: any) => r.slo_code).filter(Boolean)
  );

  if (startI === 0 && startOffset === 0) {
    // Only clear if starting fresh
    await supabase.from('slo_database').delete().eq('document_id', documentId);
  }

  const rawBlocksRaw = extractRawSloBlocks(processedText);
  // BUG FIX: Deduplicate raw blocks by content hash before sending to AI.
  // linearizeSloText creates N copies per horizontal row; extractRawSloBlocks
  // finds all of them. Deduplicating here saves significant API quota.
  const blockSeen = new Set<string>();
  const rawBlocks = rawBlocksRaw.filter(block => {
    const key = createHash('md5').update(block.trim()).digest('hex');
    if (blockSeen.has(key)) return false;
    blockSeen.add(key);
    return true;
  });
  if (rawBlocksRaw.length !== rawBlocks.length) {
    console.log(`[Extract] Deduplicated raw blocks: ${rawBlocksRaw.length} → ${rawBlocks.length}`);
  }

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
    const BATCH_SIZE = 30; // Reduced batch size for better rate limit handling
    const CONCURRENCY = 3; // Reduced concurrency to stay within Gemini free tier (60 RPM)
    
    for (let i = startI; i < rawBlocks.length; i += BATCH_SIZE * CONCURRENCY) {
      const promises = [];
      for (let j = 0; j < CONCURRENCY; j++) {
        const offset = i + (j * BATCH_SIZE);
        if (offset >= rawBlocks.length) break;
        
        const batch = rawBlocks.slice(offset, offset + BATCH_SIZE).join('\n\n');
        promises.push(
          callAIOrchestrator(apiKey, batch, schema, subjectName, subjectCode, boardKey, chunkIndex + j + 1, false, pattern)
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

          // Prevent duplicate slo_code for the same document to avoid unique constraint violations
          if (processed.slo_code) {
            if (seenCodes.has(processed.slo_code)) {
              console.warn(`[Extract] Skipping duplicate slo_code: ${processed.slo_code}`);
              continue;
            }
            seenCodes.add(processed.slo_code);
          }

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
            const { error } = await supabase.from('slo_database').insert(coded);
            if (error) console.error(`[Extract] Coded insert FAILED for chunk ${cIndex}:`, error.message);
          }
          if (codeless.length > 0) {
            const { error } = await supabase.from('slo_database').insert(codeless);
            if (error) console.error(`[Extract] Codeless insert FAILED for chunk ${cIndex}:`, error.message);
          }
        }
        console.log(`[Extract] Chunk ${cIndex}: +${newRecords.length} new SLOs (${allSlos.length} total)`);
      }
    }
  }

  if (allSlos.length === 0) {
    console.log(`[Extract] No SLOs found via Regex path (or no blocks found). Falling back to Deep Scan sliding window... Resuming from offset ${startOffset}`);
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
        const chunkSlos = await callAIOrchestrator(apiKey, chunk, schema, subjectName, subjectCode, boardKey, chunkIndex, true, pattern);

        const newRecords: any[] = [];
        for (const s of chunkSlos) {
          if (typeof s.slo_full_text !== 'string' || !s.slo_full_text.trim()) continue;
          
          const fp = createHash('md5').update(`${s.slo_code ?? 'null'}|${s.slo_full_text}`).digest('hex');
          if (seenFp.has(fp)) continue;
          seenFp.add(fp);
          
          const processed = processSlos([s], boardKey, subjectCode, domainMap)[0];
          if (!processed) continue;

          // Prevent duplicate slo_code for the same document to avoid unique constraint violations
          if (processed.slo_code) {
            if (seenCodes.has(processed.slo_code)) {
              console.warn(`[Extract] Deep Scan: Skipping duplicate slo_code: ${processed.slo_code}`);
              continue;
            }
            seenCodes.add(processed.slo_code);
          }

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
            const { error } = await supabase.from('slo_database').insert(coded);
            if (error) console.error(`[Extract] Deep Scan: Coded insert FAILED for chunk ${chunkIndex}:`, error.message);
          }
          if (codeless.length > 0) {
            const { error } = await supabase.from('slo_database').insert(codeless);
            if (error) console.error(`[Extract] Deep Scan: Codeless insert FAILED for chunk ${chunkIndex}:`, error.message);
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

  // Save successful pattern for future learning
  if (allSlos.length >= 5) {
    await saveExtractionPattern(supabase, text, allSlos, boardKey, subjectName);
  }

  return allSlos;
}

// ── ENRICHMENT ENGINE ────────────────────────────────────────────────────────
async function enrichSlos(documentId: string, supabase: any, apiKey: string, jobId: string, queue: IngestionQueue) {
  const { data: slos, error } = await supabase
    .from('slo_database')
    .select('*')
    .eq('document_id', documentId);

  if (error || !slos || slos.length === 0) {
    console.warn(`[Enrich] No SLOs found for document ${documentId}`);
    return;
  }

  console.log(`[Enrich] Starting enrichment for ${slos.length} SLOs...`);

  const BATCH_SIZE = 15;
  for (let i = 0; i < slos.length; i += BATCH_SIZE) {
    const batch = slos.slice(i, i + BATCH_SIZE);
    const progress = Math.round((i / slos.length) * 10) + 75; // 75% → 85%

    await queue.updateProgress(jobId, {
      step: IngestionStep.ENRICH,
      progress,
      message: `Enriching SLOs (${i + 1}–${Math.min(i + BATCH_SIZE, slos.length)} of ${slos.length})...`
    });

    // BUG FIX (S3-Bug2): Use a stable row index for matching, not slo_code.
    // The previous code told AI to use "INDEX_1" for codeless SLOs, then tried
    // to find them with `batch.find(s => s.slo_code === "INDEX_1")` — which
    // never matched because DB rows have `slo_code: null`, not "INDEX_1".
    // Fix: use the DB row's `id` field as the stable key for round-trip matching.
    const prompt = `IDENTITY: Pedagogy Master AI (Enrichment Engine)
GOAL: For each Student Learning Outcome (SLO) below, determine the Bloom's Taxonomy level, Cognitive Complexity, and 3-5 relevant keywords.

SLOs:
${batch.map((s: any) => `[ROW_ID: ${s.id}] ${s.slo_full_text}`).join('\n')}

=== SCHEMA ===
Return ONLY a JSON object with a field "enrichments" (array):
{
  "row_id": "<exact row_id from input>",
  "bloom_level": "Remember" | "Understand" | "Apply" | "Analyze" | "Evaluate" | "Create",
  "cognitive_complexity": "Low" | "Medium" | "High",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

RULES:
- "row_id" must exactly match the ROW_ID provided in the input.
- bloom_level MUST be one of: Remember, Understand, Apply, Analyze, Evaluate, Create
  (NOT "Remembering", "Understanding" etc. — use the BASE form without -ing)
- Return ONLY valid JSON, no markdown.`;

    // BUG FIX (S3-Bug1): Bloom's levels now use base form ("Remember" not "Remembering").
    // Previously used "-ing" suffix which mismatched the rest of the app.
    // BUG FIX (S3-Bug2): Schema now uses row_id (stable) not slo_code (unreliable for nulls).
    try {
      const data = await callAIChain(apiKey, prompt, {
        type: Type.OBJECT,
        properties: {
          enrichments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                row_id: { type: Type.STRING },
                bloom_level: { type: Type.STRING },
                cognitive_complexity: { type: Type.STRING },
                keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ['row_id', 'bloom_level']
            }
          }
        }
      });

      const enrichments = data.enrichments || [];

      if (Array.isArray(enrichments) && enrichments.length > 0) {
        // BUG FIX (S3-Bug3): Batch all updates for this batch in one pass.
        // Previous code: 1 DB update per SLO = up to 200 sequential DB calls.
        // New code: collect all updates, then do them in parallel (max 10 at once).
        const updates = enrichments
          .filter((item: any) => item.row_id)
          .map((item: any) => {
            // Validate bloom_level — only accept known values
            const validBlooms = new Set(['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create']);
            const bloom = validBlooms.has(item.bloom_level) ? item.bloom_level : null;

            // Validate cognitive_complexity
            const validComplexity = new Set(['Low', 'Medium', 'High']);
            const complexity = validComplexity.has(item.cognitive_complexity) ? item.cognitive_complexity : null;

            return supabase
              .from('slo_database')
              .update({
                bloom_level: bloom,
                cognitive_complexity: complexity,
                keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 10) : []
              })
              .eq('id', item.row_id);
          });

        // Run up to 10 DB updates concurrently
        const CONCURRENCY = 10;
        for (let j = 0; j < updates.length; j += CONCURRENCY) {
          const batch = updates.slice(j, j + CONCURRENCY);
          const results = await Promise.allSettled(batch);
          results.forEach((r, idx) => {
            if (r.status === 'rejected') {
              console.error(`[Enrich] Update failed for item ${j + idx}:`, r.reason);
            }
          });
        }
        console.log(`[Enrich] Batch ${Math.ceil(i / BATCH_SIZE) + 1}: enriched ${enrichments.length} SLOs`);
      }
    } catch (e: any) {
      console.error(`[Enrich] Batch ${Math.ceil(i / BATCH_SIZE) + 1} failed:`, e.message);
    }
  }
}

// ── UNIVERSAL CURRICULUM STANDARDIZER (Grok Ingestion Engine v1.0) ────────────
function standardizeCurriculum(
  slos: any[],
  boardKey: string,
  subjectCode: string,
  docName: string
): { jsonText: string; updatedSlos: any[] } {
  const subjectName = SUBJECTS[subjectCode] || subjectCode;

  // 1. Detect Grade System (Roman vs. Arabic vs. Mixed)
  let gradeSystem = 'Arabic';
  const rawGrades = slos.map(s => String(s.grade || s.grade_level || ''));
  const hasRoman = rawGrades.some(g => {
    const u = g.toUpperCase();
    return u === 'I' || u === 'II' || u === 'III' || u === 'IV' || u === 'V' || u === 'VI' || u === 'VII' || u === 'VIII' || u === 'IX' || u === 'X' || u === 'XI' || u === 'XII';
  });
  if (hasRoman) {
    gradeSystem = 'Roman';
  }

  const ROMAN_BY_NUM: Record<string, string> = {
    '01': 'I', '02': 'II', '03': 'III', '04': 'IV', '05': 'V', '06': 'VI',
    '07': 'VII', '08': 'VIII', '09': 'IX', '10': 'X', '11': 'XI', '12': 'XII',
    '13': 'XIII'
  };

  const sortedSlosWithIndex = slos.map((s, idx) => ({ ...s, original_index: idx }));

  const bloomOrder: Record<string, number> = {
    'remember': 1,
    'understand': 2,
    'apply': 3,
    'analyze': 4,
    'evaluate': 5,
    'create': 6
  };

  const getBloomPriority = (bloom: string | null | undefined): number => {
    if (!bloom) return 99;
    const b = bloom.toLowerCase().trim();
    return bloomOrder[b] || 99;
  };

  // Group items by grade and domain
  const groups: Record<string, Record<string, any[]>> = {};
  const mappedGrades = new Set<string>();

  for (const s of sortedSlosWithIndex) {
    const rawGrade = s.grade || s.grade_level || '';
    const normGrade = normalizeGrade(rawGrade) || '99';
    mappedGrades.add(normGrade);

    let rawDomain = s.domain || 'X';
    let domainStr = typeof rawDomain === 'string' ? rawDomain.toUpperCase().trim().substring(0, 1) : 'X';
    if (!domainStr || !/[A-Z]/.test(domainStr)) domainStr = 'X';

    if (!groups[normGrade]) groups[normGrade] = {};
    if (!groups[normGrade][domainStr]) groups[normGrade][domainStr] = [];
    groups[normGrade][domainStr].push(s);
  }

  // Detect grade range
  const validGrades = Array.from(mappedGrades).filter(g => g !== '99').sort();
  let gradeRange = 'General';
  if (validGrades.length > 0) {
    const minG = validGrades[0];
    const maxG = validGrades[validGrades.length - 1];
    const displayMin = gradeSystem === 'Roman' ? (ROMAN_BY_NUM[minG] || minG) : parseInt(minG, 10).toString();
    const displayMax = gradeSystem === 'Roman' ? (ROMAN_BY_NUM[maxG] || maxG) : parseInt(maxG, 10).toString();
    gradeRange = `${displayMin}-${displayMax}`;
  }

  const gradesObject: Record<string, any> = {};
  const updatedSlos: any[] = [];
  let totalDomainsCount = 0;
  let totalSlosCount = 0;

  const sortedGradeKeys = Object.keys(groups).sort();

  for (const gradeKey of sortedGradeKeys) {
    const dispName = gradeSystem === 'Roman' ? (ROMAN_BY_NUM[gradeKey] || gradeKey) : `Grade ${parseInt(gradeKey, 10) || gradeKey}`;
    const domainsForGrade: Record<string, any> = {};

    const domainKeys = Object.keys(groups[gradeKey]).sort();
    totalDomainsCount += domainKeys.length;

    for (const domainKey of domainKeys) {
      const parentDomainSlos = groups[gradeKey][domainKey];
      const dname = parentDomainSlos[0]?.domain_name || 'General Core';

      // SORT within domain: Bloom level order first, then original found code, then original index
      const sortedInDomain = [...parentDomainSlos].sort((a, b) => {
        const bpA = getBloomPriority(a.bloom_level);
        const bpB = getBloomPriority(b.bloom_level);
        if (bpA !== bpB) return bpA - bpB;

        const codeA = a.slo_code || '';
        const codeB = b.slo_code || '';
        if (codeA !== codeB) return codeA.localeCompare(codeB);

        return a.original_index - b.original_index;
      });

      const slosInDomainOutput: any[] = [];

      sortedInDomain.forEach((s, idx) => {
        totalSlosCount++;
        const seqStr = String(idx + 1).padStart(2, '0');
        const universalSloId = `SLO:${subjectCode}-${gradeKey}-${domainKey}-${seqStr}`;
        const originalCode = s.raw_code_as_found || s.slo_code || s.code || 'CODEL_SLO';

        slosInDomainOutput.push({
          slo_id: universalSloId,
          original_code: originalCode,
          bloom_level: s.bloom_level || 'Understand',
          full_text: s.slo_full_text || s.full_text || s.description || ''
        });

        updatedSlos.push({
          ...s,
          slo_code: universalSloId,
          raw_code_as_found: originalCode,
          domain: domainKey,
          domain_name: dname,
          grade_level: gradeKey,
          grade: gradeKey
        });
      });

      domainsForGrade[domainKey] = {
        domain_name: dname,
        slos: slosInDomainOutput
      };
    }

    gradesObject[gradeKey] = {
      display_name: dispName,
      domains: domainsForGrade
    };
  }

  const gradeMapping: Record<string, string> = {};
  for (const gk of sortedGradeKeys) {
    if (gk !== '99') {
      const disp = gradeSystem === 'Roman' ? (ROMAN_BY_NUM[gk] || gk) : parseInt(gk, 10).toString();
      gradeMapping[disp] = gk;
    }
  }

  const jsonObject = {
    curriculum: {
      name: docName || 'Universal Curriculum Ingestion',
      subject: subjectName,
      subject_code: subjectCode,
      grade_system: gradeSystem,
      grade_range: gradeRange
    },
    grades: gradesObject,
    metadata: {
      total_grades: sortedGradeKeys.length,
      total_domains: totalDomainsCount,
      total_slos: totalSlosCount,
      grade_mapping: gradeMapping
    }
  };

  return {
    jsonText: JSON.stringify(jsonObject, null, 2),
    updatedSlos
  };
}

// ── LEDGER JSON BUILDER ───────────────────────────────────────────────────────
function buildLedger(slos: any[], boardKey: string, subjectCode: string): string {
  const boardName = BOARD_NAMES[boardKey] || boardKey;
  const subjectName = SUBJECTS[subjectCode] || subjectCode;

  // Preserve the physical sequence of document ingestion with an original_index field
  const slosWithIndex = slos.map((s, i) => ({ ...s, original_index: i }));

  const sorted = [...slosWithIndex].sort((a, b) => {
    // 1. Grade level as number
    let gA = 99;
    const rawGradeA = a.grade || a.grade_level;
    if (rawGradeA) {
      const uA = rawGradeA.toString().toUpperCase();
      if (uA === 'K' || uA === 'KG') {
        gA = 0;
      } else {
        const parsed = parseInt(uA.replace(/\D/g, ''), 10);
        if (!isNaN(parsed)) gA = parsed;
      }
    }

    let gB = 99;
    const rawGradeB = b.grade || b.grade_level;
    if (rawGradeB) {
      const uB = rawGradeB.toString().toUpperCase();
      if (uB === 'K' || uB === 'KG') {
        gB = 0;
      } else {
        const parsed = parseInt(uB.replace(/\D/g, ''), 10);
        if (!isNaN(parsed)) gB = parsed;
      }
    }

    if (gA !== gB) return gA - gB;

    // 2. Domain letter as string (A-Z)
    let domA = 'Z';
    if (a.domain && typeof a.domain === 'string') {
      domA = a.domain.toUpperCase().trim();
    }
    let domB = 'Z';
    if (b.domain && typeof b.domain === 'string') {
      domB = b.domain.toUpperCase().trim();
    }
    
    if (domA !== domB) return domA.localeCompare(domB);

    // 3. Extract the SLO index number from the slo_code
    let numA = 0;
    if (a.slo_code && typeof a.slo_code === 'string') {
      const lastDigits = a.slo_code.match(/(\d+)(?:\D*)$/);
      if (lastDigits) {
        numA = parseInt(lastDigits[1], 10) || 0;
      }
    }
    let numB = 0;
    if (b.slo_code && typeof b.slo_code === 'string') {
      const lastDigits = b.slo_code.match(/(\d+)(?:\D*)$/);
      if (lastDigits) {
        numB = parseInt(lastDigits[1], 10) || 0;
      }
    }
    
    if (numA !== numB) return numA - numB;

    // 4. Raw SLO number sequence (e.g. "1.1.2" -> 2)
    let rawSeqA = 0;
    if (a.raw_slo_num && typeof a.raw_slo_num === 'string') {
      const parts = a.raw_slo_num.split('.');
      const lastPart = parts[parts.length - 1];
      if (lastPart) rawSeqA = parseInt(lastPart.replace(/\D/g, ''), 10) || 0;
    }
    let rawSeqB = 0;
    if (b.raw_slo_num && typeof b.raw_slo_num === 'string') {
      const parts = b.raw_slo_num.split('.');
      const lastPart = parts[parts.length - 1];
      if (lastPart) rawSeqB = parseInt(lastPart.replace(/\D/g, ''), 10) || 0;
    }
    
    if (rawSeqA !== rawSeqB) return rawSeqA - rawSeqB;

    // 5. Page number fallback
    const pageA = parseInt(a.page || a.page_number || '0', 10) || 0;
    const pageB = parseInt(b.page || b.page_number || '0', 10) || 0;
    
    if (pageA !== pageB) return pageA - pageB;

    // 6. Original index fallback
    return a.original_index - b.original_index;
  });

  let md = `# ${boardName} — ${subjectName}\n\n`;

  const grades = [...new Set(sorted.map(s => s.grade || s.grade_level || 'Unknown'))];

  for (const grade of grades) {
    if (grade === 'Unknown' || !grade) {
      md += `## General Objectives\n\n`;
    } else {
      md += `## Grade ${grade}\n\n`;
    }
    const gradeSlos = sorted.filter(s => (s.grade || s.grade_level || 'Unknown') === grade);
    const domains = [...new Set(gradeSlos.map(s => s.domain || '?'))];

    for (const domain of domains) {
      const domainSlos = gradeSlos.filter(s => (s.domain || '?') === domain);
      const domainName = domainSlos[0]?.domain_name || 'Domain';
      if (domain === '?' || !domain) {
        md += `### ${domainName || 'General'}\n\n`;
      } else {
        md += `### Domain ${domain}: ${domainName}\n\n`;
      }

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
    grade_level: s.grade || s.grade_level || '',
    domain: s.domain || '',
    domain_name: s.domain_name || ''
  }));

  md += `<STRUCTURED_INDEX>\n${JSON.stringify(structuredIndex, null, 2)}\n</STRUCTURED_INDEX>`;

  return md;
}

// ── ROUTE HANDLER ─────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  context: any
) {
  try {
    const params = await context?.params;
    const documentId = params?.documentId;

    if (!documentId || documentId === 'null' || documentId === 'undefined') {
      return NextResponse.json({ 
        error: 'Invalid Document ID', 
        details: 'The document ID provided is missing or invalid.' 
      }, { status: 400 });
    }

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    // Check for service role key early
    const hasServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY && 
                         !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('placeholder');
    
    // Determine which client to use for the trigger phase
    // If no service key, we MUST use the user token to act on their behalf
    const triggerSupabase = hasServiceKey 
      ? getSupabaseAdminClient() 
      : (token ? getSupabaseServerClient(token) : getSupabaseAdminClient());
    
    const queue = new IngestionQueue(triggerSupabase);

    if (!hasServiceKey && !token) {
      console.error('[Ingestion] CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing and no user token provided.');
      return NextResponse.json({ 
        error: 'Infrastructure misconfiguration: Service Role Key missing and no user token provided.',
        details: 'Please set SUPABASE_SERVICE_ROLE_KEY in your environment or ensure you are logged in.'
      }, { status: 500 });
    }

    let job: any;
    try {
      // Retry job status check to handle potential replication lag
      let lastErr = null;
      for (let i = 0; i < 3; i++) {
        try {
          job = await queue.getJobStatus(documentId);
          lastErr = null;
          break;
        } catch (e: any) {
          lastErr = e;
          console.warn(`[Ingestion] Job status check attempt ${i+1} failed:`, e.message);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      if (lastErr) throw lastErr;
    } catch (e: any) {
      console.error('[Ingestion] Failed to fetch job status:', e.message);
      return NextResponse.json({ 
        error: 'Vault access failure', 
        details: e.message || 'The database rejected the handshake. Check RLS policies.' 
      }, { status: 500 });
    }

    if (!job) {
      try {
        const id = await queue.enqueue(documentId);
        job = { id, step: IngestionStep.EXTRACT };
      } catch (e: any) {
        console.error('[Ingestion] Failed to enqueue job:', e.message);
        return NextResponse.json({ 
          error: 'Job initialization failure', 
          details: e.message || 'Could not register ingestion job in the vault.' 
        }, { status: 500 });
      }
    } else if (job.status === 'complete' || job.step === IngestionStep.COMPLETE) {
      return NextResponse.json({ success: true, done: true, step: 'COMPLETE', progress: 100 });
    } else if (job.status === 'processing' && job.updated_at) {
      const lastUpdate = new Date(job.updated_at).getTime();
      if (Date.now() - lastUpdate < 60000) { 
        console.log(`[Ingestion] Job is actively processing (updated ${Math.round((Date.now() - lastUpdate)/1000)}s ago). Ignoring duplicate trigger.`);
        return NextResponse.json({ success: true, message: 'Already processing' });
      }
      console.log(`[Ingestion] Stale job detected. Resuming from step ${job.step}...`);
      const { error: resetErr } = await triggerSupabase.from('ingestion_jobs')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', job.id);
      
      if (resetErr) {
        console.error('[Ingestion] Failed to reset stale job:', resetErr);
        return NextResponse.json({ error: 'Job reset failed', details: resetErr.message }, { status: 500 });
      }
    } else if (job.status === 'pending') {
      const { error: startErr } = await triggerSupabase.from('ingestion_jobs')
        .update({ status: 'processing', message: null, updated_at: new Date().toISOString() })
        .eq('id', job.id);
      
      if (startErr) {
        console.error('[Ingestion] Failed to start pending job:', startErr);
        return NextResponse.json({ error: 'Job start failed', details: startErr.message }, { status: 500 });
      }
      if (!job.step) job.step = IngestionStep.EXTRACT;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Ingestion] START doc=${documentId} step=${job.step}`);
    console.log(`${'='.repeat(60)}`);

    console.log(`[Ingestion] Background process started for doc=${documentId}`);
    
    // Use user-scoped client if possible, fallback to admin
    const supabase = token ? getSupabaseServerClient(token) : getSupabaseAdminClient();
    // queue is already defined above

    try {
      // FIX: Add retry loop for document fetch to handle Supabase replication lag/race conditions
      let doc = null;
      let retries = 0;
      while (!doc && retries < 5) {
        const { data, error } = await supabase
          .from('documents').select('*').eq('id', documentId).single();
        
        if (data) {
          doc = data;
          break;
        }
        
        console.warn(`[Ingestion] Document ${documentId} not found (attempt ${retries + 1}/5). Retrying in 2s...`);
        if (error) console.error(`[Ingestion] DB Error during fetch:`, error);
        
        retries++;
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!doc) throw new Error('VAULT_ERROR: Document not found in database after multiple attempts. This may be due to replication lag or a failed insert.');

      // ════════════════════════════════════════════════════════
      // STAGE 1 — EXTRACT (pdf-parse → raw text)
      // ════════════════════════════════════════════════════════
      if (job.step === IngestionStep.EXTRACT) {
        await queue.updateProgress(job.id, {
          step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching PDF...',
        });

        let text = doc.extracted_text || '';
        let pdfBuffer: Buffer | null = null;
        
      if (!text || text.length < 200 || (doc.mime_type === 'application/pdf' && doc.file_path)) {
        console.log(`[Stage 1] Condition met for server-side re-extraction (PDF=${doc.mime_type === 'application/pdf'}, hasPath=${!!doc.file_path}, textLen=${text.length})`);
        const r2Path = doc.file_path;
        if (!r2Path) {
          if (!text || text.length < 200) throw new Error('R2_FAULT: No file_path on document and no pre-extracted text');
          // If no R2 but we have some text, we have to stick with it
          console.warn('[Stage 1] No binary available, continuing with limited client-side text.');
        } else {
          try {
            pdfBuffer = await getObjectBuffer(r2Path);
            if (!pdfBuffer)  throw new Error('R2_FAULT: File unreachable from R2');

            const result = await pdf(pdfBuffer);
            text = result.text?.trim() || '';
            const numPages = result.numpages || (result as any).numPages || 0;
            console.log(`[Stage 1] PDF parsed: ${text.length} chars, ${numPages} pages`);

            if (text.length < 200) {
              const isScanned = numPages > 0 && text.length < 50 * numPages;
              throw new Error(
                isScanned
                  ? `SCANNED_PDF: This appears to be a scanned image PDF with no text layer. Please use a text-based PDF or convert it with OCR first.`
                  : `PDF_TOO_SHORT: only ${text.length} chars extracted — bad PDF?`
              );
            }
          } catch (e: any) {
            console.error('[Stage 1] R2 fetch failed:', e);
            throw new Error(`R2_FAULT: ${e.message}`);
          }
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

        let docSummary = `raw|board:${board}|subject:${subject}|len:${text.length}`;

        // ── TABLE-AWARE EXTRACTION ───────────────────────────────────────────
        if (likelyHasMultiGradeTable(text)) {
           console.log('[Stage 1] Likely multi-grade table detected. Running table-aware extractor...');
           if (!pdfBuffer) {
              const r2Path = doc.file_path;
              if (r2Path) {
                try { pdfBuffer = await getObjectBuffer(r2Path); } catch (_) {}
              }
           }
           
           if (pdfBuffer) {
              const tableSlos = await extractSLOsFromPDFBuffer(pdfBuffer, subject);
              if (tableSlos.length > 0) {
                console.log(`[Stage 1] Table extractor found ${tableSlos.length} SLOs. Populating database...`);
                
                const records = tableSlos.map(s => ({
                  document_id: documentId,
                  slo_code: s.slo_code,
                  slo_full_text: s.slo_full_text,
                  grade_level: s.grade_level,
                  domain: s.domain,
                  domain_name: s.domain_name,
                  subject: s.subject || SUBJECTS[subject] || subject,
                  board: board,
                  extraction_confidence: 1.0,
                  page_number: s.page,
                  created_at: new Date().toISOString()
                }));

                const { jsonText, updatedSlos } = standardizeCurriculum(records, board, subject, doc.name);
                text = jsonText;

                // Clear any partial extraction if we're doing table-aware fresh
                await supabase.from('slo_database').delete().eq('document_id', documentId);

                // Insert in batches
                const BATCH_SIZE = 100;
                for (let i = 0; i < updatedSlos.length; i += BATCH_SIZE) {
                  const batch = updatedSlos.slice(i, i + BATCH_SIZE).map(s => ({
                    document_id: documentId,
                    slo_code: s.slo_code,
                    slo_full_text: s.slo_full_text,
                    domain: s.domain,
                    domain_name: s.domain_name,
                    bloom_level: s.bloom_level,
                    cognitive_complexity: s.cognitive_complexity,
                    keywords: s.keywords || [],
                    subject: s.subject,
                    grade_level: s.grade_level,
                    extraction_confidence: 1.0,
                    page_number: s.page_number || null,
                    is_truncated: s.is_truncated || false,
                    is_orphan_domain: s.is_orphan_domain || false,
                    raw_code_as_found: s.raw_code_as_found,
                    created_at: new Date().toISOString(),
                    board: board
                  }));
                  const { error } = await supabase.from('slo_database').insert(batch);
                  if (error) console.error('[Stage 1] Table insert error:', error.message);
                }

                docSummary = `ledger|slos:${updatedSlos.length}|board:${board}|subject:${subject}|table_aware:true`;
                console.log('[Stage 1] Table-extracted ledger built. Stage 2 will skip re-extraction.');

                // Save pattern memory
                await saveExtractionPattern(supabase, text, updatedSlos, board, SUBJECTS[subject] || subject);
              }
           }
        }

        await supabase.from('documents').update({
          extracted_text  : text,
          document_summary: docSummary,
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
              } else if (data.grades && typeof data.grades === 'object') {
                // Grok universal nesting support
                for (const [gradeKey, gradeVal] of Object.entries(data.grades)) {
                  const gVal = gradeVal as any;
                  if (gVal.domains && typeof gVal.domains === 'object') {
                    for (const [domainKey, domainVal] of Object.entries(gVal.domains)) {
                      const dVal = domainVal as any;
                      if (dVal.slos && Array.isArray(dVal.slos)) {
                        for (const s of dVal.slos) {
                          items.push({
                            slo_code: s.slo_id || s.original_code || null,
                            slo_full_text: s.full_text || s.slo_full_text || '',
                            grade: gradeKey,
                            domain: domainKey,
                            domain_name: dVal.domain_name,
                            bloom_level: s.bloom_level || null,
                            raw_code_as_found: s.original_code || null
                          });
                        }
                      }
                    }
                  }
                }
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
          const apiKey = resolveApiKey();

          if (!apiKey) {
            throw new Error(
              'API_KEY_MISSING: set GEMINI_API_KEY in the environment.'
            );
          }
          console.log(`[Stage 2] API key found (${apiKey.substring(0, 8)}...)`);

          const domainMap = scanDomains(rawText);
          console.log(`[Stage 2] Pre-scanned domains:`, Object.keys(domainMap));

          // ── STAGE 2: NEW TABLE-AWARE PATH ──────────────────────────────────────────
          // Step 1: Try pdfplumber table detection first (handles multi-grade column tables)
          let slos: any[] = [];
          let usedTablePath = false;

          if (likelyHasMultiGradeTable(rawText)) {
            console.log('[Stage 2] Multi-grade table structure detected. Attempting pdfplumber extraction...');
            try {
              const pdfBuffer = await getObjectBuffer(doc.file_path);
              if (pdfBuffer) {
                const tableResults = await extractSLOsFromPDFBuffer(pdfBuffer, subject);
                if (tableResults.length > 0) {
                  console.log(`[Stage 2] Table extraction success: ${tableResults.length} SLOs`);
                  usedTablePath = true;

                  // Write to slo_database
                  const records = tableResults.map(s => ({
                    document_id: documentId,
                    slo_code: s.slo_code,
                    slo_full_text: s.slo_full_text,
                    domain: s.domain,
                    domain_name: s.domain_name,
                    bloom_level: null,
                    cognitive_complexity: null,
                    keywords: [],
                    subject: s.subject || SUBJECTS[subject] || subject,
                    grade_level: s.grade_level,
                    extraction_confidence: 0.95,
                    page_number: s.page,
                    is_truncated: false,
                    is_orphan_domain: false,
                    raw_code_as_found: s.raw_slo_num,
                    char_offset: 0,
                    benchmark: null,
                    board: board,
                    teaching_strategies: [],
                    assessment_ideas: [],
                    prerequisite_concepts: [],
                    common_misconceptions: [],
                    created_at: new Date().toISOString()
                  }));

                  // Clear current and insert in batches of 50
                  await supabase.from('slo_database').delete().eq('document_id', documentId);
                  for (let i = 0; i < records.length; i += 50) {
                    const batch = records.slice(i, i + 50);
                    const { error } = await supabase.from('slo_database').insert(batch);
                    if (error) console.error(`[Stage 2] Table insert error batch ${i}:`, error.message);
                  }

                  // Convert to internal format for ledger building
                  slos = records.map(r => ({
                    ...r,
                    grade: r.grade_level,
                    regex_confidence: 0.95
                  }));
                }
              }
            } catch (e: any) {
              console.error('[Stage 2] Table extraction failed, falling back to regex:', e.message);
            }
          }

          // Step 2: Fallback to legacy regex path if table extraction didn't work
          if (!usedTablePath || slos.length === 0) {
            console.log('[Stage 2] Using legacy regex extraction path...');
            slos = await extractSlos(rawText, board, subject, domainMap, apiKey, documentId, supabase, job.id, queue);
          }

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
            return;
          } else {
            // Fetch all SLOs from DB to ensure we have the complete list if we resumed
            const { data: allDbSlos } = await supabase.from('slo_database').select('*').eq('document_id', documentId);
            const fullSloList = (allDbSlos && allDbSlos.length > 0) ? allDbSlos : slos;
            
            console.log(`[Stage 2] Standardizing and sorting ${fullSloList.length} SLOs using Grok Curriculum Engine...`);
            const { jsonText, updatedSlos } = standardizeCurriculum(fullSloList, board, subject, doc.name);
            
            // Re-sync standardized SLOs back into the DB (delete raw ones, insert standardized ones)
            await supabase.from('slo_database').delete().eq('document_id', documentId);
            
            const BATCH_SIZE = 100;
            for (let i = 0; i < updatedSlos.length; i += BATCH_SIZE) {
              const batch = updatedSlos.slice(i, i + BATCH_SIZE).map(s => ({
                document_id: documentId,
                slo_code: s.slo_code,
                slo_full_text: s.slo_full_text || s.full_text || s.description || '',
                domain: s.domain,
                domain_name: s.domain_name,
                bloom_level: s.bloom_level || null,
                cognitive_complexity: s.cognitive_complexity || null,
                keywords: s.keywords || [],
                subject: s.subject || SUBJECTS[subject] || subject,
                grade_level: s.grade_level,
                extraction_confidence: s.extraction_confidence || 1.0,
                page_number: s.page_number || null,
                is_truncated: s.is_truncated || false,
                is_orphan_domain: s.is_orphan_domain || false,
                raw_code_as_found: s.raw_code_as_found,
                char_offset: s.char_offset || 0,
                benchmark: s.benchmark || null,
                board: board,
                teaching_strategies: s.teaching_strategies || [],
                assessment_ideas: s.assessment_ideas || [],
                prerequisite_concepts: s.prerequisite_concepts || [],
                common_misconceptions: s.common_misconceptions || [],
                created_at: new Date().toISOString()
              }));
              
              const { error: insertErr } = await supabase.from('slo_database').insert(batch);
              if (insertErr) {
                console.error(`[Stage 2] Standardized SLO insert error batch starting at ${i}:`, insertErr.message);
              }
            }

            await supabase.from('documents').update({
              extracted_text  : jsonText,
              document_summary: `ledger|slos:${updatedSlos.length}|board:${board}|subject:${subject}`,
            }).eq('id', documentId);
            console.log(`[Stage 2] Universal JSON Standardized Ledger saved ✓`);
          }

          await queue.updateProgress(job.id, {
            step: IngestionStep.ENRICH, progress: 75, message: 'Enriching SLO metadata...',
          });
          job = await queue.getJobStatus(documentId);
        } else {
          // Skip extraction but move to next step
          await queue.updateProgress(job.id, {
            step: IngestionStep.ENRICH, progress: 75, message: 'Enriching ledger metadata...',
          });
          job = await queue.getJobStatus(documentId);
        }
      }

      // ════════════════════════════════════════════════════════
      // STAGE 3 — ENRICH (AI → Bloom Levels & Keywords)
      // ════════════════════════════════════════════════════════
      if (job.step === IngestionStep.ENRICH) {
        console.log(`[Stage 3] START ENRICH`);
        
        const apiKey = resolveApiKey();

        if (apiKey) {
          await enrichSlos(documentId, supabase, apiKey, job.id, queue);
        } else {
          console.warn('[Stage 3] Skipping enrichment: No API key found.');
        }

        await queue.updateProgress(job.id, {
          step: IngestionStep.EMBED, progress: 85, message: 'Building RAG index...',
        });
        job = await queue.getJobStatus(documentId);
      }

      // ════════════════════════════════════════════════════════
      // STAGE 4 — EMBED (RAG vector indexing)
      // ════════════════════════════════════════════════════════
      if (job.step === IngestionStep.EMBED) {
        console.log(`[Stage 4] START EMBED`);

        // RE-COMPILE FULLY ENRICHED UNIVERSAL JSON PRIOR TO EMBED & DEPLOYMENT
        const { data: docInfo } = await supabase
          .from('documents')
          .select('name, document_summary')
          .eq('id', documentId)
          .single();
          
        const meta = docInfo?.document_summary || '';
        const boardCode = meta.match(/board:(\w+)/)?.[1] || 'SINDH';
        const subjectCode = meta.match(/subject:([A-Z]+)/)?.[1] || 'B';
        const docName = docInfo?.name || '';
        
        const { data: enrichedSlos } = await supabase
          .from('slo_database')
          .select('*')
          .eq('document_id', documentId);
          
        let txt = '';
        if (enrichedSlos && enrichedSlos.length > 0) {
          console.log(`[Stage 4] Compiling 100% enriched Grok structured JSON for RAG and viewer...`);
          const { jsonText } = standardizeCurriculum(enrichedSlos, boardCode, subjectCode, docName);
          txt = jsonText;
          
          await supabase.from('documents').update({
            extracted_text: jsonText,
          }).eq('id', documentId);
        } else {
          const { data: fin } = await supabase
            .from('documents')
            .select('extracted_text')
            .eq('id', documentId)
            .single();
          txt = fin?.extracted_text || '';
        }

        const isLedger = txt.startsWith('# ') || txt.startsWith('Board:') || txt.startsWith('```json') || txt.startsWith('{') || txt.trim().startsWith('{');
        console.log(`[Stage 4] Text to embed: ${txt.length} chars, isLedger: ${isLedger}`);

        if (txt.length >= 100) {
          await indexDocumentForRAG(documentId, txt, supabase, job.id);
        } else {
          console.warn(`[Stage 4] Text too short (${txt.length}) — skipping RAG`);
        }

        // Explicit status update BEFORE markComplete to ensure poller sees 'ready'
        const { error: updateErr } = await supabase
          .from('documents')
          .update({
            status          : 'ready',
            rag_indexed     : true,
            document_summary: isLedger
              ? 'Universal JSON Ledger'
              : 'indexed',
          })
          .eq('id', documentId);

        if (updateErr) {
          console.error('[Stage 4] FAILED to update doc status to ready:', updateErr);
        } else {
          console.log('[Stage 4] Document status → ready ✓');
        }

        await queue.markComplete(job.id);
      }

      console.log(`[Ingestion] DONE doc=${documentId}`);

    } catch (err: any) {
      const msg = String(err.message || err).substring(0, 500);
      console.error(`[Ingestion] FATAL doc=${documentId}:`, msg);
      try { await queue.markFailed(job.id, msg); }    catch (_) {}
      try {
        await supabase.from('documents')
          .update({ status: 'failed', document_summary: msg })
          .eq('id', documentId);
      } catch (_) {}
    }

  return NextResponse.json({ success: true });
} catch (fatal: any) {
  console.error('[Ingestion] FATAL HANDSHAKE ERROR:', fatal);
  return NextResponse.json({ 
    error: 'Neural Grid Handshake Failure', 
    details: fatal.message || String(fatal) 
  }, { status: 500 });
}
}
