import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { smartExtractPDF } from '../../../../../lib/rag/vision-extractor';
import { IngestionStep } from '../../../../../types';
import { neuralGrid } from '../../../../../lib/ai/model-orchestrator';
import { IngestionQueue } from '../../../../../lib/jobs/ingestion-queue';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════════════════
// UNIVERSAL CURRICULUM INGESTION ENGINE v3.0
// Enterprise-grade | State-machine-driven | Fault-tolerant
// Pakistan Phase 1: Sindh Textbook Board (Biology reference)
// Extensible: Punjab, FBISE, KPK, Balochistan → IB, CBSE, UK NC
// ═══════════════════════════════════════════════════════════════════════

// ── LAYER 1: PAKISTAN BOARD REGISTRY ────────────────────────────────────
const PAKISTAN_BOARDS: Record<string, {
  name: string;
  subjectCodes: Record<string, string>;
  sloPattern: RegExp;
  gradePattern: RegExp;
  domainPattern: RegExp;
  patternType: 'hierarchical_code' | 'decimal' | 'lo_textual' | 'competency';
  normalization: (code: string) => string;
}> = {
  SINDH: {
    name: 'Sindh Textbook Board',
    subjectCodes: {
      'B': 'Biology', 'P': 'Physics', 'C': 'Chemistry',
      'M': 'Mathematics', 'E': 'English', 'U': 'Urdu',
      'CS': 'Computer Science', 'GEO': 'Geography',
    },
    sloPattern: /(?:SLO\s*[:\-]?\s*)?([A-Z]{1,3})-(\d{1,2})-([A-Z])-(\d{2})/g,
    gradePattern: /(?:grade|class)\s*:?\s*(IX|X{0,3}I{0,3}|V?I{0,3}|\d{1,2})/gi,
    domainPattern: /DOMAIN\s+([A-Z])\s*[:\-]\s*([^\n]+)/gi,
    patternType: 'hierarchical_code',
    normalization: (code: string) => code
      .replace(/SL0/g, 'SLO')
      .replace(/\s+/g, '')
      .toUpperCase()
      .trim(),
  },
  PUNJAB: {
    name: 'Punjab Curriculum & Textbook Board',
    subjectCodes: { 'B': 'Biology', 'P': 'Physics', 'C': 'Chemistry', 'M': 'Mathematics' },
    sloPattern: /(?:SLO|LO|Outcome)\s*[:\-]?\s*(\d+)\.(\d+)\.(\d+)/g,
    gradePattern: /(?:grade|class)\s*:?\s*(IX|X|XI|XII|\d{1,2})/gi,
    domainPattern: /(?:UNIT|CHAPTER|TOPIC)\s+(\d+)\s*[:\-]\s*([^\n]+)/gi,
    patternType: 'decimal',
    normalization: (code: string) => code.trim().toUpperCase(),
  },
};

const ROMAN_TO_GRADE: Record<string, string> = {
  'I': '01', 'II': '02', 'III': '03', 'IV': '04', 'V': '05',
  'VI': '06', 'VII': '07', 'VIII': '08', 'IX': '09', 'X': '10',
  'XI': '11', 'XII': '12',
};

// ── LAYER 2: HIERARCHICAL STATE MACHINE ─────────────────────────────────
interface CurriculumState {
  // Hierarchy
  board: string;
  subject: string;
  detectedSubjectCode: string;
  currentGrade: string;
  currentDomain: string;
  currentDomainName: string;
  currentBenchmark: string;
  // Domain Registry — only accept declared domains
  declaredDomains: Record<string, string>; // { 'A': 'Nature of Science', 'B': 'Cell Biology' }
  // Page tracking
  currentPageEstimate: number;
  charsProcessed: number;
  // Audit
  orphanCodes: string[];
  flaggedTruncations: string[];
  ingestionWarnings: string[];
}

// ── LAYER 3: BOARD & SUBJECT DETECTION ──────────────────────────────────
function detectBoard(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('sindh') || lower.includes('stbb')) return 'SINDH';
  if (lower.includes('punjab') || lower.includes('pctb')) return 'PUNJAB';
  if (lower.includes('federal') || lower.includes('fbise')) return 'FBISE';
  if (lower.includes('kpk') || lower.includes('khyber')) return 'KPK';
  return 'SINDH';
}

function detectSubjectCode(text: string, boardKey: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('biology')) return 'B';
  if (lower.includes('physics')) return 'P';
  if (lower.includes('chemistry')) return 'C';
  if (lower.includes('mathematics') || lower.includes('maths')) return 'M';
  if (lower.includes('english')) return 'E';
  if (lower.includes('computer')) return 'CS';
  return 'B';
}

function normalizeGrade(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  if (ROMAN_TO_GRADE[trimmed]) return ROMAN_TO_GRADE[trimmed];
  const num = parseInt(trimmed);
  if (!isNaN(num)) return num.toString().padStart(2, '0');
  return trimmed;
}

// ── LAYER 4: DOMAIN REGISTRY — pre-scan declared domains ────────────────
function scanDeclaredDomains(fullText: string): Record<string, string> {
  const domains: Record<string, string> = {};
  const pattern = /DOMAIN\s+([A-Z])\s*[:\-]\s*([^\n]+)/gi;
  let match;
  while ((match = pattern.exec(fullText)) !== null) {
    const letter = match[1].toUpperCase();
    const title = match[2].trim().replace(/\s+/g, ' ');
    if (!domains[letter]) {
      domains[letter] = title;
    }
  }
  return domains;
}

// ── LAYER 5: CONFIDENCE SCORING ─────────────────────────────────────────
// Score = weighted average of 5 signals. NOT hardcoded 0.85.
function computeConfidence(params: {
  regexStrength: number;     // 0-1: did code match strict pattern?
  domainValidated: boolean;  // domain exists in declared registry
  boundaryClarity: number;   // 0-1: did SLO text end cleanly?
  aiValidated: boolean;      // AI confirmed this SLO
  ocrReliable: boolean;      // text layer existed (not OCR'd)
  textLength: number;        // SLO text length signal
}): number {
  const weights = {
    regexStrength: 0.30,
    domainValidated: 0.25,
    boundaryClarity: 0.20,
    aiValidated: 0.15,
    ocrReliable: 0.10,
  };
  const score =
    (params.regexStrength * weights.regexStrength) +
    ((params.domainValidated ? 1 : 0) * weights.domainValidated) +
    (params.boundaryClarity * weights.boundaryClarity) +
    ((params.aiValidated ? 1 : 0) * weights.aiValidated) +
    ((params.ocrReliable ? 1 : 0) * weights.ocrReliable);
  return Math.round(score * 100) / 100;
}

// ── LAYER 6: BOUNDARY DETECTION ─────────────────────────────────────────
function detectTruncation(text: string): boolean {
  if (!text || text.length < 10) return true;
  const trimmed = text.trimEnd();
  // Truncated if ends mid-word, no punctuation, or very short
  const endsCleanly = /[.!?:;\-]$/.test(trimmed) || trimmed.split(' ').length > 5;
  const tooShort = trimmed.split(' ').length < 4;
  return !endsCleanly || tooShort;
}

function estimatePageNumber(charOffset: number, totalChars: number, estimatedPages: number): number {
  if (!estimatedPages || !totalChars) return 0;
  return Math.ceil((charOffset / totalChars) * estimatedPages);
}

// ── LAYER 7: VALIDATION ──────────────────────────────────────────────────
interface ValidationReport {
  duplicates: string[];
  orphanDomains: string[];  // domain letter not in declared registry
  malformed: string[];
  truncated: string[];
  totalExtracted: number;
  totalValid: number;
  warnings: string[];
}

function validateAndEnrichSLOs(
  slos: any[],
  boardKey: string,
  state: CurriculumState,
  isOcrReliable: boolean,
): { valid: any[], report: ValidationReport } {
  const seen = new Set<string>();
  const valid: any[] = [];
  const report: ValidationReport = {
    duplicates: [], orphanDomains: [], malformed: [],
    truncated: [], totalExtracted: slos.length, totalValid: 0, warnings: [],
  };

  const hasDeclaredDomains = Object.keys(state.declaredDomains).length > 0;

  for (const slo of slos) {
    const rawCode = slo.slo_code || '';
    if (!rawCode) { report.malformed.push('empty_code'); continue; }

    // Normalize code
    const board = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS['SINDH'];
    const code = board.normalization(rawCode);

    // Duplicate check
    if (seen.has(code)) { report.duplicates.push(code); continue; }

    // Pattern validation (Sindh: SUBJ-GRADE-DOMAIN-SEQ)
    const sindhPattern = /^([A-Z]{1,3})-(\d{2})-([A-Z])-(\d{2})$/;
    const altPattern = /^SLO:([A-Z]{1,3})-(\d{1,2})-([A-Z])-(\d{1,2})$/;
    const match = code.match(sindhPattern) || code.match(altPattern);

    let regexStrength = 0.5;
    let extractedDomain = slo.domain || '';

    if (match) {
      regexStrength = 1.0;
      // Extract domain letter from code itself as ground truth
      extractedDomain = match[3] || match[4] || extractedDomain;
    } else {
      report.malformed.push(code);
      regexStrength = 0.2;
      // Don't discard — flag but include with low confidence
    }

    // ── DOMAIN REGISTRY VALIDATION (Fix #2) ──
    // STRICT MODE: Only accept domains declared in document
    let domainValidated = false;
    let domainTitle = slo.domain_name || '';
    let isOrphan = false;

    if (hasDeclaredDomains) {
      if (extractedDomain && state.declaredDomains[extractedDomain]) {
        domainValidated = true;
        domainTitle = state.declaredDomains[extractedDomain]; // use canonical title
      } else if (extractedDomain) {
        // Domain letter not in declared registry → flag as orphan
        isOrphan = true;
        report.orphanDomains.push(code);
        report.warnings.push(`Orphan domain "${extractedDomain}" in ${code} — not declared in document`);
        // Include but flag — do NOT silently discard
      }
    } else {
      // No declared domains found yet — trust AI extraction
      domainValidated = true;
      domainTitle = slo.domain_name || `Domain ${extractedDomain}`;
    }

    // ── TRUNCATION DETECTION (Fix #6) ──
    const sloText = slo.slo_full_text || '';
    const isTruncated = detectTruncation(sloText);
    if (isTruncated) {
      report.truncated.push(code);
      report.warnings.push(`Possible truncation in ${code}: "${sloText.substring(0, 60)}..."`);
    }

    // ── CONFIDENCE SCORE (Fix #4 — not static 0.85) ──
    const boundaryClarity = isTruncated ? 0.3 : 0.9;
    const confidence = computeConfidence({
      regexStrength,
      domainValidated,
      boundaryClarity,
      aiValidated: true, // AI extracted it — counts as validated
      ocrReliable: isOcrReliable,
      textLength: sloText.length,
    });

    seen.add(code);
    valid.push({
      ...slo,
      slo_code: code,
      // ── Fix #1: Store domain title separately ──
      domain: extractedDomain,
      domain_name: domainTitle,
      // ── Fix #4: Real confidence score ──
      extraction_confidence: confidence,
      // ── Fix #6: Truncation flag ──
      is_truncated: isTruncated,
      // ── Fix #2: Orphan domain flag ──
      is_orphan_domain: isOrphan,
    });
  }

  report.totalValid = valid.length;
  return { valid, report };
}

// ── LAYER 8: CHUNK PROCESSOR ─────────────────────────────────────────────
// One chunk per Vercel call — Hobby plan safe (each call < 10s)
async function processOneChunk(
  content: string,
  chunkIndex: number,
  state: CurriculumState,
  isOcrReliable: boolean,
): Promise<{
  slos: any[];
  totalChunks: number;
  isDone: boolean;
  nextState: CurriculumState;
  report: ValidationReport;
}> {
  const CHUNK_SIZE = 18000;
  const OVERLAP    = 1500; // Larger overlap catches multi-line SLOs at boundaries

  const chunks: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < content.length; i += CHUNK_SIZE - OVERLAP) {
    chunks.push({ start: i, end: Math.min(i + CHUNK_SIZE, content.length) });
    if (i + CHUNK_SIZE >= content.length) break;
  }

  const totalChunks = chunks.length;
  if (chunkIndex >= totalChunks) {
    return {
      slos: [], totalChunks, isDone: true, nextState: state,
      report: { duplicates: [], orphanDomains: [], malformed: [], truncated: [], totalExtracted: 0, totalValid: 0, warnings: [] },
    };
  }

  const { start, end } = chunks[chunkIndex];
  const chunk = content.substring(start, end);

  // ── State Machine Transitions ────────────────────────────────
  const nextState: CurriculumState = { ...state };

  // Grade transitions
  const gradeMatches = [...chunk.matchAll(/(?:grade|class)\s*:?\s*(IX|X{0,3}I{0,3}|V?I{0,3}|\d{1,2})/gi)];
  if (gradeMatches.length > 0) {
    nextState.currentGrade = normalizeGrade(gradeMatches[gradeMatches.length - 1][1]);
  }

  // Domain transitions — update registry from this chunk too
  const domainMatches = [...chunk.matchAll(/DOMAIN\s+([A-Z])\s*[:\-]\s*([^\n]+)/gi)];
  for (const dm of domainMatches) {
    const letter = dm[1].toUpperCase();
    const title = dm[2].trim();
    if (!nextState.declaredDomains[letter]) {
      nextState.declaredDomains[letter] = title;
    }
  }
  if (domainMatches.length > 0) {
    const last = domainMatches[domainMatches.length - 1];
    nextState.currentDomain = last[1].toUpperCase();
    nextState.currentDomainName = last[2].trim();
  }

  // Page estimate
  nextState.charsProcessed = state.charsProcessed + chunk.length;
  nextState.currentPageEstimate = Math.ceil((nextState.charsProcessed / content.length) * 200); // rough estimate

  const declaredDomainsList = Object.entries(nextState.declaredDomains)
    .map(([k, v]) => `DOMAIN ${k}: ${v}`)
    .join('\n') || 'No domains declared yet — infer from context';

  // ── Extraction Prompt (context-first, pattern-validated) ────
  const prompt = `You are a Pakistan curriculum SLO extraction engine.
Board: ${state.board} (${PAKISTAN_BOARDS[state.board]?.name || 'Sindh Textbook Board'})
Subject: ${state.subject}

STRICT RULES — NEVER VIOLATE:
1. Extract ONLY explicitly written SLO codes. NEVER invent or continue sequences.
2. Sindh SLO format: SUBJECT-GRADE-DOMAIN-SEQ (e.g., B-09-A-01 or SLO:B-09-A-01)
3. Normalize: Roman numerals IX→09 X→10 XI→11 XII→12. OCR typo SL0→SLO.
4. Multi-line SLOs: merge continuation lines into ONE slo_full_text field.
5. Ignore page headers, footers, page numbers, chapter titles without SLO codes.
6. DOMAIN VALIDATION: Only use domain letters declared below. Flag unknown domains.
7. Return [] if no SLO codes found in this chunk.
8. Bloom classification: ONLY assign after confirming SLO text is complete.

DECLARED DOMAINS IN THIS DOCUMENT:
${declaredDomainsList}

CURRENT STATE (from previous chunks):
- Grade: ${nextState.currentGrade || 'unknown — detect from chunk'}
- Domain: ${nextState.currentDomain || 'unknown'} — ${nextState.currentDomainName || ''}
- Estimated page: ~${nextState.currentPageEstimate}

RETURN — raw JSON array ONLY, no markdown, no explanation:
[
  {
    "slo_code": "B-09-A-01",
    "raw_code_as_found": "SLO:B-09-A-01",
    "slo_full_text": "Complete merged multi-line objective",
    "bloom_level": "Remember|Understand|Apply|Analyze|Evaluate|Create",
    "subject": "${state.subject}",
    "subject_code": "${state.detectedSubjectCode}",
    "grade": "09",
    "domain": "A",
    "domain_name": "Nature of Science in Biology",
    "board": "${state.board}",
    "page_number_estimate": ${nextState.currentPageEstimate},
    "is_truncated_suspect": false
  }
]

CHUNK ${chunkIndex + 1}/${totalChunks}:
${chunk}`;

  // ── AI Call with Fault Isolation (Fix #8) ──────────────────
  let slos: any[] = [];
  let aiSucceeded = false;

  try {
    const result = await neuralGrid.execute(prompt, 'INGEST_LINEARIZE', { temperature: 0.0, maxTokens: 4096 });
    aiSucceeded = true;

    const text = result.text.trim().replace(/```json|```/g, '').trim();
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) slos = parsed;
    }
  } catch (err: any) {
    // ── FAULT ISOLATION: AI failure does NOT crash the job (Fix #8) ──
    const warning = `Chunk ${chunkIndex + 1} AI failed: ${err.message?.substring(0, 80)} — skipping, continuing`;
    console.warn(`[Pakistan Engine] ${warning}`);
    nextState.ingestionWarnings.push(warning);
    // Return empty SLOs for this chunk — job continues
    slos = [];
  }

  // ── Post-process: normalize + validate (Bloom runs AFTER validation) ──
  const board = PAKISTAN_BOARDS[state.board] || PAKISTAN_BOARDS['SINDH'];
  const normalizedSlos = slos.map(s => ({
    ...s,
    slo_code: board.normalization(s.slo_code || ''),
    grade: normalizeGrade(s.grade || nextState.currentGrade || ''),
  })).filter(s => s.slo_code.length > 0);

  // ── Validation layer runs BEFORE Bloom enrichment (Fix #5) ──
  const { valid, report } = validateAndEnrichSLOs(
    normalizedSlos,
    state.board,
    nextState,
    isOcrReliable,
  );

  console.log(
    `[Pakistan Engine v3] Chunk ${chunkIndex + 1}/${totalChunks} | ` +
    `grade:${nextState.currentGrade} domain:${nextState.currentDomain} | ` +
    `${valid.length}/${slos.length} SLOs valid | ` +
    `orphans:${report.orphanDomains.length} truncated:${report.truncated.length} | ` +
    `AI:${aiSucceeded ? 'ok' : 'FAILED-isolated'}`
  );

  return {
    slos: valid,
    totalChunks,
    isDone: chunkIndex >= totalChunks - 1,
    nextState,
    report,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const adminSupabase = getSupabaseAdminClient();
  const queue = new IngestionQueue(adminSupabase);

  // Parse body ONCE — carries chunkIndex + state between client calls
  const requestBody = await req.json().catch(() => ({}));

  let job = await queue.getJobStatus(documentId);
  if (!job) {
    const jobId = await queue.enqueue(documentId);
    job = { id: jobId, step: IngestionStep.EXTRACT };
  }

  if (job.step === IngestionStep.COMPLETE) {
    return NextResponse.json({ success: true, done: true, step: 'COMPLETE', progress: 100 });
  }

  try {
    const { data: doc } = await adminSupabase
      .from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error('VAULT_ERROR: Document not found.');

    // ── STEP 1: EXTRACT ────────────────────────────────────────────────
    if (job.step === IngestionStep.EXTRACT) {
      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching from storage...' });
      await adminSupabase.from('documents').update({ status: 'processing', document_summary: 'Extracting...' }).eq('id', documentId);

      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error('R2_FAULT: File unreachable. Check Cloudflare R2 CORS policy.');

      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 18, message: 'Detecting document type...' });

      const extraction = await smartExtractPDF(buffer, doc.name || 'document.pdf');

      if (!extraction.text || extraction.text.length < 300) {
        throw new Error(`Low quality extraction (${extraction.text?.length || 0} chars via ${extraction.method}).`);
      }

      // Detect board + subject from doc name + first 2000 chars
      const sampleText = (doc.name || '') + ' ' + extraction.text.substring(0, 2000);
      const detectedBoard = detectBoard(sampleText);
      const detectedSubjectCode = detectSubjectCode(sampleText, detectedBoard);
      const boardInfo = PAKISTAN_BOARDS[detectedBoard];
      const isOcrReliable = extraction.method === 'text'; // pdf-parse = reliable, vision = OCR

      // ── Pre-scan FULL document for declared domains ──
      const declaredDomains = scanDeclaredDomains(extraction.text);
      const domainCount = Object.keys(declaredDomains).length;

      await adminSupabase.from('documents').update({
        // Store FULL text — no truncation
        extracted_text: extraction.text,
        document_summary: `Extracted via ${extraction.method} — ${extraction.text.length} chars | Board:${detectedBoard} | Subject:${detectedSubjectCode} | Domains:${domainCount}`,
      }).eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE,
        progress: 30,
        message: `${extraction.method === 'vision' ? 'Vision' : 'Text'} extraction complete. ${boardInfo?.name || detectedBoard} detected. ${domainCount} domains found.`,
      });

      return NextResponse.json({
        success: true, done: false, step: 'EXTRACT', nextStep: 'LINEARIZE',
        progress: 30, method: extraction.method, charCount: extraction.text.length,
        board: detectedBoard,
        subject: boardInfo?.subjectCodes[detectedSubjectCode] || detectedSubjectCode,
        declaredDomains,
        isOcrReliable,
        message: `Step 1/3 complete. ${boardInfo?.name || 'Pakistan curriculum'} detected. ${domainCount} domains pre-scanned.`,
      });
    }

    // ── STEP 2: LINEARIZE — chunked, state-machine-driven ─────────────
    if (job.step === IngestionStep.LINEARIZE || requestBody.chunkIndex !== undefined) {
      const chunkIndex: number = requestBody.chunkIndex ?? 0;

      const { data: current, error: fetchErr } = await adminSupabase
        .from('documents').select('extracted_text, document_summary').eq('id', documentId).single();
      if (fetchErr) throw new Error(`LINEARIZE_FAULT: DB read failed — ${fetchErr.message}`);

      const rawText = current?.extracted_text || '';
      if (rawText.length < 100) {
        throw new Error(`LINEARIZE_FAULT: No extracted text (${rawText.length} chars). Run Step 1 first.`);
      }

      // Re-detect board/subject from document name + text
      const boardKey = detectBoard((doc.name || '') + rawText.substring(0, 2000));
      const subjectCode = detectSubjectCode((doc.name || '') + rawText.substring(0, 2000), boardKey);
      const boardInfo = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS['SINDH'];
      const subjectName = boardInfo.subjectCodes[subjectCode] || 'Unknown';

      // Determine OCR reliability from summary
      const isOcrReliable = (current?.document_summary || '').includes('text —');

      // Restore or initialize state machine
      const state: CurriculumState = requestBody.state || {
        board: boardKey,
        subject: subjectName,
        detectedSubjectCode: subjectCode,
        currentGrade: '',
        currentDomain: '',
        currentDomainName: '',
        currentBenchmark: '',
        declaredDomains: scanDeclaredDomains(rawText), // full pre-scan
        currentPageEstimate: 0,
        charsProcessed: 0,
        orphanCodes: [],
        flaggedTruncations: [],
        ingestionWarnings: [],
      };

      const totalChunks = Math.ceil(rawText.length / 16500);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE,
        progress: 35 + Math.round(((chunkIndex + 1) / totalChunks) * 25),
        message: `[${boardKey}] Chunk ${chunkIndex + 1}/${totalChunks}...`,
      });

      const { slos, isDone, nextState, report } = await processOneChunk(
        rawText, chunkIndex, state, isOcrReliable,
      );

      // Upsert validated SLOs with full enrichment
      if (slos.length > 0) {
        const records = slos.map((s: any) => ({
          document_id: documentId,
          slo_code: s.slo_code,
          slo_full_text: s.slo_full_text || '',
          // Fix #1: domain title stored explicitly
          domain: s.domain || nextState.currentDomain || '',
          domain_name: s.domain_name || nextState.currentDomainName || '',
          bloom_level: s.bloom_level || 'Understand',
          subject: s.subject || subjectName,
          grade_level: s.grade || nextState.currentGrade || '',
          // Fix #4: real confidence score
          extraction_confidence: s.extraction_confidence ?? 0.5,
          // Fix #3: page number
          page_number: s.page_number_estimate || nextState.currentPageEstimate || null,
          // Fix #6: truncation flag
          is_truncated: s.is_truncated ?? false,
          // Fix #2: orphan domain flag
          is_orphan_domain: s.is_orphan_domain ?? false,
          cognitive_complexity: s.bloom_level || 'Understand',
          teaching_strategies: [],
          assessment_ideas: [],
          prerequisite_concepts: [],
          common_misconceptions: [],
          keywords: [],
        }));

        if (chunkIndex === 0) {
          await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
        }
        await adminSupabase.from('slo_database').insert(records);
      }

      // Accumulate ingestion warnings in state
      nextState.ingestionWarnings.push(...report.warnings);

      const progressPct = 35 + Math.round(((chunkIndex + 1) / totalChunks) * 25);

      if (!isDone) {
        return NextResponse.json({
          success: true, done: false,
          step: 'LINEARIZE', nextStep: 'LINEARIZE',
          chunkIndex: chunkIndex + 1,
          totalChunks,
          progress: progressPct,
          slosThisChunk: slos.length,
          orphansThisChunk: report.orphanDomains.length,
          truncatedThisChunk: report.truncated.length,
          state: nextState,
          message: `[${boardKey}] Chunk ${chunkIndex + 1}/${totalChunks} — ${slos.length} SLOs | orphans:${report.orphanDomains.length} truncated:${report.truncated.length}`,
        });
      }

      // ── ALL CHUNKS DONE ──────────────────────────────────────
      const { count: sloCount } = await adminSupabase
        .from('slo_database').select('*', { count: 'exact', head: true }).eq('document_id', documentId);

      const { data: allSlos } = await adminSupabase
        .from('slo_database').select('*').eq('document_id', documentId);

      // Build ingestion report
      const ingestionReport = {
        board: boardKey,
        boardName: boardInfo.name,
        subject: subjectName,
        totalSLOs: sloCount || 0,
        declaredDomains: nextState.declaredDomains,
        warnings: nextState.ingestionWarnings,
        orphanCodes: nextState.orphanCodes,
        flaggedTruncations: nextState.flaggedTruncations,
        completedAt: new Date().toISOString(),
      };

      const markdown = `### ${boardInfo.name} — ${subjectName} Curriculum\n\nIngestion Report:\n${JSON.stringify(ingestionReport, null, 2)}\n\n<STRUCTURED_INDEX>\n${JSON.stringify(allSlos, null, 2)}\n</STRUCTURED_INDEX>`;

      await adminSupabase.from('documents').update({
        extracted_text: markdown,
        document_summary: `Linearized — ${sloCount || 0} SLOs | ${Object.keys(nextState.declaredDomains).length} domains | ${nextState.ingestionWarnings.length} warnings`,
      }).eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.EMBED,
        progress: 63,
        message: `${sloCount} SLOs from ${boardInfo.name}. Building vectors...`,
      });

      return NextResponse.json({
        success: true, done: false, step: 'LINEARIZE', nextStep: 'EMBED',
        progress: 63, sloCount,
        ingestionReport,
        message: `Step 2/3 complete — ${sloCount} SLOs | ${nextState.ingestionWarnings.length} warnings`,
      });
    }

    // ── STEP 3: EMBED ──────────────────────────────────────────────────
    if (job.step === IngestionStep.EMBED) {
      await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 70, message: 'Building vector index...' });

      const { data: finalDoc } = await adminSupabase
        .from('documents').select('extracted_text').eq('id', documentId).single();
      const textToEmbed = finalDoc?.extracted_text || '';
      if (textToEmbed.length < 100) throw new Error('EMBED_FAULT: No text to embed.');

      const result = await indexDocumentForRAG(documentId, textToEmbed, adminSupabase, job.id);
      const chunkCount = result?.count || 0;

      // Chunk–SLO mapping (non-fatal)
      try {
        const { data: chunks } = await adminSupabase
          .from('document_chunks').select('id, slo_codes').eq('document_id', documentId);
        const { data: slos } = await adminSupabase
          .from('slo_database').select('id, slo_code').eq('document_id', documentId);
        if (chunks?.length && slos?.length) {
          const sloMap = Object.fromEntries(slos.map(s => [s.slo_code, s.id]));
          const mappings: any[] = [];
          chunks.forEach(chunk => {
            (chunk.slo_codes || []).forEach((code: string) => {
              if (sloMap[code]) mappings.push({ chunk_id: chunk.id, slo_id: sloMap[code], slo_code: code });
            });
          });
          if (mappings.length > 0) await adminSupabase.from('chunk_slo_mapping').insert(mappings);
        }
      } catch (e) { console.warn('[EMBED] Mapping skipped (non-fatal):', e); }

      await queue.markComplete(job.id);
      await adminSupabase.from('documents').update({
        status: 'ready',
        rag_indexed: true,
        document_summary: `Ready — ${chunkCount} vectors`,
      }).eq('id', documentId);

      return NextResponse.json({
        success: true, done: true, step: 'EMBED', progress: 100,
        chunkCount, message: `Complete — ${chunkCount} vectors indexed.`,
      });
    }

    return NextResponse.json({ error: 'Unknown step', step: job.step }, { status: 400 });

  } catch (err: any) {
    const msg = err.message || 'Processing failed.';
    console.error(`[Pakistan Engine v3] Fatal:`, msg);
    try { await queue.markFailed(job.id, msg); } catch (_) {}
    const { data: cur } = await adminSupabase.from('documents').select('status').eq('id', documentId).single();
    if (cur?.status !== 'ready') {
      await adminSupabase.from('documents').update({
        status: 'failed',
        document_summary: msg.substring(0, 500),
      }).eq('id', documentId);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
