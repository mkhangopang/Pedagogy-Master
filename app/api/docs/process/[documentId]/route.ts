// FIXED: app/api/docs/process/[documentId]/route.ts — Pedagogy Master AI
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep } from '../../../../../types';
import { IngestionQueue } from '../../../../../lib/jobs/ingestion-queue';
import pdf from 'pdf-parse';
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 300; 

// ═══════════════════════════════════════════════════════════════════════
// UNIVERSAL CURRICULUM INGESTION ENGINE v5.1 (ESSENTIAL EDITION)
// ─────────────────────────────────────────────────────────────────────
// Stage 1 — EXTRACT  : pdf-parse (deterministic)
// Stage 2 — LINEARIZE : Regex state-machine (zero AI tokens)
// Stage 3 — ENRICH    : AI Bloom Taxonomy classification
// Stage 4 — EMBED    : Vector indexing
// ═══════════════════════════════════════════════════════════════════════

const UNIVERSAL_SUBJECTS: Record<string, string> = {
  'B': 'Biology', 'P': 'Physics', 'C': 'Chemistry', 'M': 'Mathematics',
  'E': 'English', 'U': 'Urdu', 'S': 'General Science', 'CS': 'Computer Science',
  'GEO': 'Geography', 'ECO': 'Economics', 'PST': 'Pakistan Studies',
  'ISL': 'Islamiat', 'SS': 'Social Studies', 'ETH': 'Ethics', 'SIN': 'Sindhi', 'ARA': 'Arabic'
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
    subjectCodes: UNIVERSAL_SUBJECTS,
    sloRegex: /(?:SLO|LO|\[SLO:)\s*[:\-]?\s*([A-Z]{1,3})[-]?(\d{1,2})[-]?([A-Z])[-]?(\d{1,2})/gi,
    gradeRegex: /(?:grade|class|std)\s*[:\-]?\s*(IX|X{1,3}I{0,3}|V?I{1,3}|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: (code: string) => {
      let cleaned = code
        .toUpperCase()
        // Remove known prefixes and wrappers
        .replace(/^\[?(?:5L0|SL[O0]|LO)[:\s]*/i, '')
        .replace(/[\[\]:]/g, '')
        .replace(/[·.\s]/g, '')
        .trim();
      
      // Fix OCR artifacts: trailing "L]", "l]", "I" → "1"
      cleaned = cleaned.replace(/L\]?$/, '1').replace(/I$/, '1');
      // Fix "O" → "0" at end of numeric section
      cleaned = cleaned.replace(/(\d)O$/, '$10');
      // Remove dashes (C-09-A-01 → C09A01)
      cleaned = cleaned.replace(/-/g, '');

      // Handle Roman numeral grades embedded in codes (e.g. BIXA01 -> B09A01)
      cleaned = cleaned.replace(
        /^([A-Z]{1,3})(XII|XI|IX|X|VIII|VII|VI|V|IV|III|II)([A-Z])(\d{1,3})$/,
        (_, subj, roman, domain, num) => {
          const grade = ROMAN_TO_GRADE[roman] ?? roman;
          return `${subj}${grade}${domain}${num.padStart(2, '0')}`;
        }
      );

      // Try to pad if it matches the 4-part pattern (Subject, Grade, Domain, SLO)
      // e.g. C9A5 -> C09A05
      const match = cleaned.match(/^([A-Z]{1,3})(\d{1,2})([A-Z])(\d{1,3})$/);
      if (match) {
        const subj = match[1];
        const grade = match[2].padStart(2, '0');
        const domain = match[3];
        const slo = match[4].length === 3 && match[4].startsWith('00') 
          ? match[4].slice(-2) // Fix 001 -> 01
          : match[4].padStart(2, '0');
        return `${subj}${grade}${domain}${slo}`;
      }

      return cleaned.length > 2 ? cleaned : null;
    },
  },
  PUNJAB: {
    name: 'Punjab Curriculum & Textbook Board',
    subjectCodes: UNIVERSAL_SUBJECTS,
    sloRegex: /(?:SLO|LO|Outcome)\s*[:\-]?\s*(\d+)\.(\d+)\.(\d+)/g,
    gradeRegex: /(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/gi,
    domainRegex: /(?:UNIT|CHAPTER|TOPIC)\s+(\d+)\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:OBJECTIVE|OBJ)\s*[:\-]?\s*([^\n\r]{10,120})/gi,
    patternType: 'decimal',
    normalizeFn: (code: string) => code.trim().toUpperCase().replace(/[:\-]/g, ''),
  },
  FBISE: {
    name: 'Federal Board of Intermediate and Secondary Education',
    subjectCodes: UNIVERSAL_SUBJECTS,
    sloRegex: /(?:SLO|LO)\s*[:\-]?\s*([A-Z]{1,3})[-]?(\d{1,2})[-]?([A-Z])[-]?(\d{1,2})/gi,
    gradeRegex: /(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: (code: string) => code.trim().toUpperCase().replace(/[\-\s]/g, ''),
  },
  KPK: {
    name: 'Khyber Pakhtunkhwa Textbook Board',
    subjectCodes: UNIVERSAL_SUBJECTS,
    sloRegex: /(?:SLO|LO)\s*[:\-]?\s*([A-Z]{1,3})[-]?(\d{1,2})[-]?([A-Z])[-]?(\d{1,2})/gi,
    gradeRegex: /(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: (code: string) => code.trim().toUpperCase().replace(/[\-\s]/g, ''),
  },
  BALOCHISTAN: {
    name: 'Balochistan Curriculum & Textbook Board',
    subjectCodes: UNIVERSAL_SUBJECTS,
    sloRegex: /(?:SLO|LO)\s*[:\-]?\s*([A-Z]{1,3})[-]?(\d{1,2})[-]?([A-Z])[-]?(\d{1,2})/gi,
    gradeRegex: /(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: (code: string) => code.trim().toUpperCase().replace(/[\-\s]/g, ''),
  },
  AJK: {
    name: 'AJK Textbook Board',
    subjectCodes: UNIVERSAL_SUBJECTS,
    sloRegex: /(?:SLO|LO)\s*[:\-]?\s*([A-Z]{1,3})[-]?(\d{1,2})[-]?([A-Z])[-]?(\d{1,2})/gi,
    gradeRegex: /(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: (code: string) => code.trim().toUpperCase().replace(/[\-\s]/g, ''),
  },
};

const ROMAN_TO_GRADE: Record<string, string> = {
  'I': '01', 'II': '02', 'III': '03', 'IV': '04', 'V': '05',
  'VI': '06', 'VII': '07', 'VIII': '08', 'IX': '09', 'X': '10',
  'XI': '11', 'XII': '12',
};

function detectBoard(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('sindh') || t.includes('stbb')) return 'SINDH';
  if (t.includes('punjab') || t.includes('pctb')) return 'PUNJAB';
  if (t.includes('federal') || t.includes('fbise')) return 'FBISE';
  if (t.includes('kpk') || t.includes('khyber')) return 'KPK';
  if (t.includes('balochistan') || t.includes('bctb')) return 'BALOCHISTAN';
  if (t.includes('ajk') || t.includes('azad jammu')) return 'AJK';
  return 'SINDH';
}

function detectSubject(text: string): string {
  const t = text.toLowerCase();
  
  // Look at the first 1000 characters for the primary subject title
  const titleRegion = t.substring(0, 1000);
  if (titleRegion.includes('chemistry')) return 'C';
  if (titleRegion.includes('physics')) return 'P';
  if (titleRegion.includes('biology')) return 'B';
  if (titleRegion.includes('mathematics') || titleRegion.includes(' math')) return 'M';
  if (titleRegion.includes('computer')) return 'CS';
  
  // Fallback to general search
  if (t.includes('biology')) return 'B';
  if (t.includes('physics')) return 'P';
  if (t.includes('chemistry')) return 'C';
  if (t.includes('mathematics') || t.includes(' math')) return 'M';
  if (t.includes('english')) return 'E';
  if (t.includes('computer')) return 'CS';
  if (t.includes('general science')) return 'S';
  if (t.includes('economics')) return 'ECO';
  if (t.includes('pakistan studies')) return 'PST';
  if (t.includes('urdu')) return 'U';
  if (t.includes('geography')) return 'GEO';
  if (t.includes('islamiat')) return 'ISL';
  if (t.includes('social studies')) return 'SS';
  if (t.includes('ethics')) return 'ETH';
  if (t.includes('sindhi')) return 'SIN';
  if (t.includes('arabic')) return 'ARA';
  return 'B';
}

function normalizeGrade(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (ROMAN_TO_GRADE[t]) return ROMAN_TO_GRADE[t];
  const n = parseInt(t);
  return isNaN(n) ? t : n.toString().padStart(2, '0');
}

interface RawSLO {
  slo_code: string | null;
  raw_code_as_found: string;
  slo_full_text: string;
  grade: string;
  domain: string;
  domain_name: string;
  benchmark: string;
  subject: string;
  subject_code: string;
  board: string;
  char_offset: number;
  page_number_estimate: number;
  is_truncated: boolean;
  is_orphan_domain: boolean;
  regex_confidence: number;
}

function computeConfidence(slo: RawSLO, isOcrReliable: boolean): number {
  const weights = { regex: 0.35, domain: 0.25, boundary: 0.20, ocr: 0.20 };
  return Math.round((
    (slo.regex_confidence * weights.regex) +
    ((!slo.is_orphan_domain ? 1.0 : 0.2) * weights.domain) +
    ((slo.is_truncated ? 0.3 : 1.0) * weights.boundary) +
    ((isOcrReliable ? 1.0 : 0.6) * weights.ocr)
  ) * 100) / 100;
}

import { orchestrator } from '../../../../../lib/ai/model-orchestrator';
import { resolveApiKey } from '../../../../../lib/env-server';
import { extractJson } from '../../../../../lib/ai/utils';

async function llmExtract(text: string, boardKey: string, subjectCode: string, feedbackExamples: any[] = []): Promise<RawSLO[]> {
  let feedbackPrompt = "";
  if (feedbackExamples.length > 0) {
    feedbackPrompt = `\n### FEEDBACK-DRIVEN CORRECTIONS (STRICT ADHERENCE REQUIRED):\n` + 
      feedbackExamples.map(f => `INPUT: ${f.original_text}\nOUTPUT: ${JSON.stringify(f.corrected_json)}`).join('\n---\n');
  }

  const CHUNK_SIZE = 24000; // Increased for better context
  const OVERLAP = 6000;   // Increased to ensure context (benchmarks) is captured
  const MAX_OUTPUT_TOKENS = 8192;
  const allRawSlos: any[] = [];
  const seenFingerprints = new Set<string>();

  const schema = {
    type: Type.OBJECT,
    properties: {
      slos: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            slo_code: { type: Type.STRING, nullable: true },
            raw_code_as_found: { type: Type.STRING, nullable: true },
            slo_full_text: { type: Type.STRING },
            grade: { type: Type.STRING, nullable: true },
            domain: { type: Type.STRING, nullable: true },
            domain_name: { type: Type.STRING, nullable: true },
            benchmark: { type: Type.STRING, nullable: true },
            subject: { type: Type.STRING, nullable: true },
            subject_code: { type: Type.STRING, nullable: true },
            board: { type: Type.STRING, nullable: true },
            is_truncated: { type: Type.BOOLEAN, nullable: true },
            is_orphan_domain: { type: Type.BOOLEAN, nullable: true }
          },
          required: ["slo_full_text"]
        }
      }
    }
  };

  const apiKey = resolveApiKey();
  const ai = new GoogleGenAI({ apiKey });

  // SLIDING WINDOW EXTRACTION: Process the entire document in chunks
  let offset = 0;
  while (offset < text.length) {
    // Smart boundary detection: try to end chunk at a newline within the overlap zone
    let end = Math.min(offset + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const searchRegion = text.substring(end - 1000, end);
      const lastNewline = searchRegion.lastIndexOf('\n');
      if (lastNewline !== -1) {
        end = (end - 1000) + lastNewline + 1;
      }
    }

    const processingText = text.substring(offset, end);
    console.log(`[Ingestion] Processing chunk at offset ${offset}, length ${processingText.length}`);

    const board = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS.SINDH;
    const prompt = `You are an elite pedagogical data engineer.
    
Your task: Extract EVERY Student Learning Outcome (SLO) from the text.
    
### RULES:
1. EXTRACT ALL: Do not skip any learning objective.
2. VERBATIM: Copy slo_full_text exactly.
3. CODES: Extract slo_code (e.g., B09A01). If missing, use null.
4. GRIDS: If grades are in columns, extract them grade-by-grade.
5. NO BLOOM: Do NOT classify Bloom Taxonomy levels.

### OUTPUT FORMAT (JSON):
{
  "slos": [
    {
      "slo_code": "B09A01",
      "slo_full_text": "Concept of biology",
      "grade": "09",
      "domain": "A",
      "domain_name": "Introduction to Biology",
      "subject": "Biology",
      "subject_code": "B",
      "board": "${boardKey}"
    },
    {
      "slo_code": "B09A02",
      "slo_full_text": "Point out Quranic instructions to reveal the study of Life",
      "grade": "09",
      "domain": "A",
      "domain_name": "Introduction to Biology",
      "subject": "Biology",
      "subject_code": "B",
      "board": "${boardKey}"
    }
  ]
}

### TEXT TO PROCESS:
${processingText}
`;

    try {
      let chunkSlos: any[] = [];
      
      // TIER 1: Gemini 3 Flash (Cost-Efficient)
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            maxOutputTokens: MAX_OUTPUT_TOKENS
          }
        });
        const data = extractJson(response.text || '{"slos": []}');
        chunkSlos = Array.isArray(data) ? data : (data.slos || []);
      } catch (err: any) {
        console.warn(`[Ingestion] Tier 1 Flash failed for chunk. Falling back to Tier 2: Gemini 3.1 Pro...`);
        const response = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { 
            responseMimeType: "application/json", 
            responseSchema: schema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
          }
        });
        const data = extractJson(response.text || '{"slos": []}');
        chunkSlos = Array.isArray(data) ? data : (data.slos || []);
      }

      // Deduplicate and add to master list
      for (const s of chunkSlos) {
        const fingerprint = createHash('md5')
          .update(`${s.slo_code ?? 'null'}:${s.slo_full_text}`)
          .digest('hex');
          
        if (!seenFingerprints.has(fingerprint)) {
          seenFingerprints.add(fingerprint);
          allRawSlos.push(s);
        }
      }

    } catch (chunkErr: any) {
      console.error(`[Ingestion] Failed to process chunk at offset ${offset}:`, chunkErr.message);
      // Continue to next chunk instead of failing entire document
    }

    // Advance offset
    const MIN_ADVANCE = Math.floor(CHUNK_SIZE / 2);
    const nextOffset = end - OVERLAP;
    offset = Math.max(offset + MIN_ADVANCE, nextOffset);

    // Safety break to prevent infinite loops or excessive costs on massive docs
    if (offset > 1000000) break; 
  }

  return processSlos(allRawSlos, boardKey, subjectCode, scanDeclaredDomains(text));
}

function processSlos(slos: any[], boardKey: string, subjectCode: string, declaredDomains: Record<string, string> = {}): RawSLO[] {
  const board = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS.SINDH;

  return slos.map((s: any) => {
    // Normalize code using the board's logic
    const normalizedCode = s.slo_code ? board.normalizeFn(s.slo_code) : null;
    let grade = s.grade ? normalizeGrade(s.grade) : null;
    let domain = s.domain ? s.domain.trim().toUpperCase() : null;
    if (domain && domain.length > 1) {
      const match = domain.match(/([A-Z])/);
      if (match) domain = match[1];
    }
    
    // Domain Name Recovery: Use declared domains if LLM missed it
    let domainName = s.domain_name || (domain ? declaredDomains[domain] : null) || null;

    // METADATA RECOVERY: If grade/domain is missing, try to extract from the code
    // Sindh Pattern: C09A01 -> Grade 09, Domain A
    if (normalizedCode && normalizedCode.match(/^[A-Z](\d{2})([A-Z])/)) {
      const match = normalizedCode.match(/^[A-Z](\d{2})([A-Z])/);
      if (!grade) grade = match![1];
      if (!domain) domain = match![2];
      if (!domainName && domain) domainName = declaredDomains[domain] || null;
    }

    const isMissingDomain = !domainName || domainName === 'N/A' || domainName === 'null';
    
    // Stop GEN- fabrication. Keep null as null.
    let finalSloCode = normalizedCode || "GENERAL";
    
    // Safety: Strip any AI-invented GEN- prefixes if they leaked through
    if (typeof finalSloCode === 'string' && finalSloCode.startsWith('GEN-')) {
      finalSloCode = "GENERAL";
    }

    return {
      ...s,
      code: finalSloCode, // Add 'code' for legacy compatibility
      slo_code: finalSloCode,
      grade: grade || "IX-XII", // Default to general grade if still missing
      domain: domain,
      domain_name: domainName,
      raw_code_as_found: s.slo_code || 'null',
      char_offset: s.char_offset || 0,
      page_number_estimate: s.page_number_estimate || 0,
      is_truncated: s.is_truncated || false,
      is_orphan_domain: isMissingDomain,
      regex_confidence: normalizedCode ? 1.0 : 0.7,
      board: boardKey,
      subject_code: subjectCode
    };
  });
}

function scanDeclaredDomains(text: string): Record<string, string> {
  const domains: Record<string, string> = {};
  const pattern = /(?:DOMAIN|STRAND)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const letter = m[1].toUpperCase();
    if (!domains[letter]) domains[letter] = m[2].trim().replace(/\s+/g, ' ');
  }
  return domains;
}

function buildCleanMarkdown(slos: any[], boardKey: string, subjectCode: string): string {
  // Sort: Grade -> Domain -> SLO Code
  const sorted = [...slos].sort((a, b) => {
    const gA = parseInt(a.grade) || 0;
    const gB = parseInt(b.grade) || 0;
    if (gA !== gB) return gA - gB;
    
    const dA = (a.domain || "Z").toUpperCase();
    const dB = (b.domain || "Z").toUpperCase();
    if (dA !== dB) return dA.localeCompare(dB);
    
    const nA = parseInt((a.slo_code || "").replace(/\D/g, '')) || 0;
    const nB = parseInt((b.slo_code || "").replace(/\D/g, '')) || 0;
    return nA - nB;
  });

  const lines: string[] = [];
  
  sorted.forEach(s => {
    const codeDisplay = s.slo_code || "GENERAL";
    lines.push(`SLO ${codeDisplay} ${s.slo_full_text}`);
  });

  return lines.join('\n');
}

function deduplicateRecords(records: any[]) {
  const seen = new Map<string, number>();
  return records.map(r => {
    // Codeless SLOs get a stable unique key from their text
    const baseKey = r.slo_code !== "GENERAL"
      ? `${r.document_id}:${r.slo_code}`
      : `${r.document_id}:NULL:${r.slo_full_text?.substring(0, 80)}`;
    
    const count = seen.get(baseKey) ?? 0;
    seen.set(baseKey, count + 1);
    
    if (count === 0) return r;
    
    // For coded SLOs: append version suffix
    // For GENERAL SLOs: they're already unique by text, so skip duplicates
    return r.slo_code !== "GENERAL"
      ? { ...r, slo_code: `${r.slo_code}_v${count + 1}` }
      : null; // drop exact text duplicates for codeless SLOs
  }).filter(Boolean);
}

async function enrichBloomTaxonomy(documentId: string, supabase: any) {
  const { data: slos } = await supabase
    .from('slo_database')
    .select('id, slo_full_text')
    .eq('document_id', documentId);

  if (!slos || slos.length === 0) return;

  const apiKey = resolveApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  const BATCH_SIZE = 25;
  for (let i = 0; i < slos.length; i += BATCH_SIZE) {
    const batch = slos.slice(i, i + BATCH_SIZE);
    const prompt = `Classify the following Student Learning Outcomes (SLOs) into Bloom's Taxonomy levels: Remember, Understand, Apply, Analyze, Evaluate, Create.
    
    Return ONLY a JSON object where the keys are the EXACT UUIDs provided and the values are the Bloom levels.
    
    SLOs:
    ${batch.map((s: any) => `UUID: ${s.id}\nTEXT: ${s.slo_full_text}`).join('\n---\n')}
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            additionalProperties: { type: Type.STRING }
          }
        }
      });

      const classifications = extractJson(response.text || '{}');
      console.log(`[Enrichment] Batch ${i / BATCH_SIZE} received ${Object.keys(classifications).length} classifications`);
      
      // Update each SLO in the batch
      for (let [id, level] of Object.entries(classifications)) {
        // Clean ID if AI added "UUID: " or similar
        const cleanId = id.replace(/^UUID:\s*/i, '').trim();
        
        const validLevels = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
        const finalLevel = validLevels.find(l => l.toLowerCase() === (level as string).toLowerCase()) || 'Understand';
        
        await supabase
          .from('slo_database')
          .update({ bloom_level: finalLevel })
          .eq('id', cleanId);
      }
    } catch (err) {
      console.error(`[Enrichment] Failed batch ${i / BATCH_SIZE}:`, err);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN ROUTE HANDLER (SINGLE-PASS ORCHESTRATOR)
// ═══════════════════════════════════════════════════════════════════════
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const adminSupabase = getSupabaseAdminClient();
  const queue = new IngestionQueue(adminSupabase);

  let job = await queue.getJobStatus(documentId).catch(() => null);
  if (!job) {
    const jobId = await queue.enqueue(documentId);
    job = { id: jobId, step: IngestionStep.EXTRACT };
  }

  if (job.step === IngestionStep.COMPLETE) {
    return NextResponse.json({ success: true, done: true, step: 'COMPLETE', progress: 100 });
  }

  try {
    const { data: doc } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error('VAULT_ERROR: Document not found.');

    // ── STAGE 1: EXTRACT ──────────────────────────────────────────────────
    if (job.step === IngestionStep.EXTRACT) {
      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching from storage...' });
      
      const r2Path = doc.file_path;
      if (!r2Path) throw new Error('R2_FAULT: No file path stored.');

      const buffer = await getObjectBuffer(r2Path);
      if (!buffer) throw new Error('R2_FAULT: File unreachable.');

      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 18, message: 'Detecting document type...' });

      // BUG-R4 FIX: Static import used instead of dynamic
      console.log(`[Ingestion] Starting PDF extraction for ${documentId}`);
      const parseResult = await pdf(buffer);
      console.log(`[Ingestion] PDF extraction complete for ${documentId}, text length: ${parseResult.text?.length}`);
      const text = parseResult.text?.trim() || '';

      if (text.length < 300) throw new Error('Extraction failed (too little text).');

      const sample = (doc.name || '') + ' ' + text.substring(0, 2000);
      const detectedBoard = detectBoard(sample);
      const detectedSubject = detectSubject(sample);
      const estimatedPages = Math.ceil(text.length / 2000);

      await adminSupabase.from('documents').update({
        extracted_text: text,
        document_summary: `Extracted|board:${detectedBoard}|subject:${detectedSubject}|pages:~${estimatedPages}`,
        status: 'processing'
      }).eq('id', documentId);

      await queue.updateProgress(job.id, { step: IngestionStep.LINEARIZE, progress: 30, message: 'Linearizing Curriculum...' });
      // BUG-R5 FIX: Re-read authoritative state
      job = await queue.getJobStatus(documentId);
    }

    // ── STAGE 2: LINEARIZE (PARSE) ────────────────────────────────────────
    if (job.step === IngestionStep.LINEARIZE || job.step === IngestionStep.PARSE) {
      console.log(`[Ingestion] Starting LINEARIZE for ${documentId}`);
      const { data: current } = await adminSupabase.from('documents').select('extracted_text, document_summary').eq('id', documentId).single();
      const rawText = current?.extracted_text || '';
      console.log('[DEBUG] Raw text length:', rawText.length);
      console.log('[DEBUG] Estimated chunks:', Math.ceil(rawText.length / (60000 - 3000)));

      const summaryMeta = current?.document_summary || '';
      
      const boardKey = summaryMeta.match(/board:(\w+)/)?.[1] || 'SINDH';
      const subjectCode = summaryMeta.match(/subject:(\w+)/)?.[1] || 'B';
      const estimatedPages = parseInt(summaryMeta.match(/pages:~?(\d+)/)?.[1] || '100');
      
      // BUG-R7 FIX: Compute isOcrReliable
      const avgLineLength = rawText.split('\n')
        .filter((l: string) => l.trim().length > 0)
        .reduce((sum: number, l: string) => sum + l.length, 0) / (rawText.split('\n').length || 1);
      const isOcrReliable = avgLineLength > 30 && rawText.length > 500;

      const declaredDomains = scanDeclaredDomains(rawText);

      // Fetch recent feedback for learning
      const { data: feedback } = await adminSupabase
        .from('slo_feedback')
        .select('original_text, corrected_json')
        .order('created_at', { ascending: false })
        .limit(10);

      const rawSLOs = await llmExtract(rawText, boardKey, subjectCode, feedback || []);
      console.log(`[Ingestion] llmExtract returned ${rawSLOs.length} SLOs`);

      const domainCounts = rawSLOs.reduce((acc, s) => {
        const key = `G${s.grade}-D${s.domain ?? 'null'}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log('[Ingestion] Domain distribution:', JSON.stringify(domainCounts));

      const scoredSLOs = rawSLOs.map(slo => ({
        ...slo,
        extraction_confidence: computeConfidence(slo, isOcrReliable),
      }));

      if (scoredSLOs.length > 0) {
        console.log('[DEBUG] Total SLOs extracted:', scoredSLOs.length);
        console.log('[DEBUG] Grades found:', [...new Set(scoredSLOs.map(s => s.grade))].sort());
        console.log('[DEBUG] Domains found:', [...new Set(scoredSLOs.map(s => s.domain))].sort());
        console.log('[DEBUG] Truncated SLOs:', scoredSLOs.filter(s => s.is_truncated).length);
        console.log('[DEBUG] Null codes:', scoredSLOs.filter(s => !s.slo_code).length);

        const records = scoredSLOs.map(s => ({
          document_id: documentId,
          slo_code: s.slo_code,
          slo_full_text: s.slo_full_text,
          domain: s.domain,
          domain_name: s.domain_name,
          bloom_level: 'N/A',
          subject: s.subject,
          grade_level: s.grade,
          extraction_confidence: s.extraction_confidence,
          page_number: s.page_number_estimate || null,
          is_truncated: s.is_truncated,
          is_orphan_domain: s.is_orphan_domain,
          raw_code_as_found: s.raw_code_as_found,
          char_offset: s.char_offset,
          benchmark: s.benchmark,
          board: s.board
        }));

        console.log(`[Ingestion] Attempting to insert ${records.length} SLO records for document ${documentId}`);
        const dedupedRecords = deduplicateRecords(records);
        await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
        // BUG-R1 FIX: Use column names for onConflict
        const { error: upsertError } = await adminSupabase.from('slo_database').upsert(dedupedRecords, { onConflict: 'document_id,slo_code' });
        if (upsertError) {
          console.error(`[Ingestion] Error upserting SLO records:`, JSON.stringify(upsertError));
          throw new Error(`DB_FAULT: ${upsertError.message}`);
        } else {
          console.log(`[Ingestion] Successfully upserted SLO records for document ${documentId}`);
        }
      } else {
        console.log(`[Ingestion] No SLOs found to insert for document ${documentId}`);
      }

      const markdown = buildCleanMarkdown(scoredSLOs, boardKey, subjectCode);
      
      // SAFETY: If extraction failed to find any SLOs, don't wipe the extracted_text
      // This prevents the "42-char wipe" bug.
      if (scoredSLOs.length > 0) {
        await adminSupabase.from('documents').update({
          extracted_text: markdown,
          document_summary: `Linearized — ${scoredSLOs.length} SLOs`,
        }).eq('id', documentId);
      } else {
        console.warn(`[Ingestion] No SLOs extracted for ${documentId}. Preserving raw text.`);
        await adminSupabase.from('documents').update({
          document_summary: `Linearized — 0 SLOs (Raw text preserved)`,
        }).eq('id', documentId);
      }

      // SKIP ENRICHMENT: Advance directly to EMBED stage
      await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 75, message: 'Building Neural Index...' });
      // BUG-R5 FIX: Re-read authoritative state
      job = await queue.getJobStatus(documentId);
    }

    // ── STAGE 3: CLEAN & ENRICH (SKIPPED) ─────────────────────────────────
    if (job.step === IngestionStep.ENRICH) {
      console.log(`[Ingestion] Skipping ENRICH for ${documentId} (Disabled)`);
      await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 75, message: 'Building Neural Index...' });
      job = await queue.getJobStatus(documentId);
    }

    // ── STAGE 4: EMBED ────────────────────────────────────────────────────
    if (job.step === IngestionStep.EMBED) {
      console.log(`[Ingestion] Starting EMBED for ${documentId}`);
      const { data: finalDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const textToEmbed = finalDoc?.extracted_text || '';

      if (textToEmbed.length >= 100) {
        await indexDocumentForRAG(documentId, textToEmbed, adminSupabase, job.id);
      }

      await queue.markComplete(job.id);
      await adminSupabase.from('documents').update({
        status: 'ready',
        rag_indexed: true,
        document_summary: 'Neural grid verified.'
      }).eq('id', documentId);
      
      // BUG-R6 FIX: Removed reload_schema_cache
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    const msg = err.message || 'Processing failed.';
    console.error(`[Engine v5.1] Fatal:`, msg);
    try { await queue.markFailed(job.id, msg); } catch (_) {}
    try {
      await adminSupabase.from('documents').update({ status: 'failed', document_summary: msg.substring(0, 500) }).eq('id', documentId);
    } catch (_) {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
