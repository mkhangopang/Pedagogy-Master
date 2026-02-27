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
// UNIVERSAL CURRICULUM INGESTION ENGINE v4.0
// ─────────────────────────────────────────────────────────────────────
// ARCHITECTURE (5-Stage Pipeline):
//
//  Stage 1 — EXTRACT    : pdf-parse (deterministic) → Vision fallback (OCR)
//  Stage 2 — PARSE      : Regex state-machine (zero AI tokens)
//  Stage 3 — VALIDATE   : Domain registry + boundary detection (zero AI)
//  Stage 4 — ENRICH     : AI batch Bloom classification (lightweight model)
//  Stage 5 — EMBED      : Vector indexing
//
// KEY PRINCIPLE: AI is NEVER the primary extractor.
//               Regex finds SLOs. AI only classifies them.
// ═══════════════════════════════════════════════════════════════════════

// ── BOARD REGISTRY ──────────────────────────────────────────────────────
const PAKISTAN_BOARDS: Record<string, {
  name: string;
  subjectCodes: Record<string, string>;
  // Deterministic regex patterns — no AI needed for extraction
  sloRegex: RegExp;
  gradeRegex: RegExp;
  domainRegex: RegExp;
  benchmarkRegex: RegExp;
  patternType: 'hierarchical_code' | 'decimal' | 'lo_textual';
  normalizeFn: (code: string) => string;
}> = {
  SINDH: {
    name: 'Sindh Textbook Board',
    subjectCodes: {
      'B': 'Biology', 'P': 'Physics', 'C': 'Chemistry', 'M': 'Mathematics',
      'E': 'English', 'U': 'Urdu', 'CS': 'Computer Science', 'GEO': 'Geography',
    },
    // Catches: B-09-A-01, SLO:B-09-A-01, SLO B-09-A-01, SLO- B-09-A-01
    // Also catches OCR variants: SL0 (zero), B-9-A-1 (no padding)
    sloRegex: /(?:SL[O0]\s*[:\-]?\s*)?([A-Z]{1,3})-(\d{1,2})-([A-Z])-(\d{1,2})/g,
    gradeRegex: /(?:grade|class|std)\s*[:\-]?\s*(IX|X{1,3}I{0,3}|V?I{1,3}|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*([^\n\r]{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: (code: string) => {
      return code
        .toUpperCase()
        .replace(/SL0/g, 'SLO')      // OCR: zero → O
        .replace(/\s+/g, '')          // remove spaces
        .replace(/-(\d)-/g, (_, n) => `-${n.padStart(2, '0')}-`)  // B-9-A → B-09-A
        .replace(/-(\d)$/, (_, n) => `-${n.padStart(2, '0')}`)    // trailing -1 → -01
        .trim();
    },
  },
  PUNJAB: {
    name: 'Punjab Curriculum & Textbook Board',
    subjectCodes: { 'B': 'Biology', 'P': 'Physics', 'C': 'Chemistry', 'M': 'Mathematics' },
    sloRegex: /(?:SLO|LO|Outcome)\s*[:\-]?\s*(\d+)\.(\d+)\.(\d+)/g,
    gradeRegex: /(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/gi,
    domainRegex: /(?:UNIT|CHAPTER|TOPIC)\s+(\d+)\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:OBJECTIVE|OBJ)\s*[:\-]?\s*([^\n\r]{10,120})/gi,
    patternType: 'decimal',
    normalizeFn: (code: string) => code.trim().toUpperCase(),
  },
};

const ROMAN_TO_GRADE: Record<string, string> = {
  'I': '01', 'II': '02', 'III': '03', 'IV': '04', 'V': '05',
  'VI': '06', 'VII': '07', 'VIII': '08', 'IX': '09', 'X': '10',
  'XI': '11', 'XII': '12',
};

// ── HELPERS ───────────────────────────────────────────────────────────────
function detectBoard(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('sindh') || t.includes('stbb')) return 'SINDH';
  if (t.includes('punjab') || t.includes('pctb')) return 'PUNJAB';
  if (t.includes('federal') || t.includes('fbise')) return 'FBISE';
  if (t.includes('kpk') || t.includes('khyber')) return 'KPK';
  return 'SINDH';
}

function detectSubject(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('biology')) return 'B';
  if (t.includes('physics')) return 'P';
  if (t.includes('chemistry')) return 'C';
  if (t.includes('mathematics') || t.includes(' math')) return 'M';
  if (t.includes('english')) return 'E';
  if (t.includes('computer')) return 'CS';
  return 'B';
}

function normalizeGrade(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (ROMAN_TO_GRADE[t]) return ROMAN_TO_GRADE[t];
  const n = parseInt(t);
  return isNaN(n) ? t : n.toString().padStart(2, '0');
}

// ── STAGE 2: DETERMINISTIC SLO EXTRACTOR ─────────────────────────────────
// Zero AI tokens. Pure regex + state machine.
// Extracts every SLO code, attaches surrounding context.
interface RawSLO {
  slo_code: string;
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

function deterministicExtract(
  text: string,
  boardKey: string,
  declaredDomains: Record<string, string>,
  subjectCode: string,
  estimatedPages: number,
  chunkCharOffset: number,
): RawSLO[] {
  const board = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS['SINDH'];
  const subjectName = board.subjectCodes[subjectCode] || 'Unknown';
  const results: RawSLO[] = [];

  // ── State machine — tracks context as we scan line by line ──
  let currentGrade = '';
  let currentDomain = '';
  let currentDomainName = '';
  let currentBenchmark = '';

  // Split into lines for state machine processing
  const lines = text.split(/\r?\n/);
  let charPos = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();
    charPos += line.length + 1;

    // ── State transition: Grade heading ──
    const gradeMatch = trimmed.match(/(?:grade|class|std)\s*[:\-]?\s*(IX|X{1,3}I{0,3}|V?I{1,3}|\d{1,2})\b/i);
    if (gradeMatch) {
      currentGrade = normalizeGrade(gradeMatch[1]);
      continue;
    }

    // ── State transition: Domain heading ──
    const domainMatch = trimmed.match(/(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*(.+)/i);
    if (domainMatch) {
      currentDomain = domainMatch[1].toUpperCase();
      currentDomainName = domainMatch[2].trim();
      if (!declaredDomains[currentDomain]) {
        declaredDomains[currentDomain] = currentDomainName;
      }
      continue;
    }

    // ── State transition: Benchmark ──
    const bmMatch = trimmed.match(/(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/i);
    if (bmMatch) {
      currentBenchmark = bmMatch[1].trim();
      continue;
    }

    // ── SLO code detection ──
    const sloRegex = new RegExp(board.sloRegex.source, 'g');
    let sloMatch;
    while ((sloMatch = sloRegex.exec(trimmed)) !== null) {
      const rawCode = sloMatch[0];
      const normalizedCode = board.normalizeFn(rawCode);

      // Extract SLO text: everything on this line after the code
      let sloText = trimmed.substring(sloMatch.index + rawCode.length).trim();

      // ── Boundary detection: merge following continuation lines ──
      // A continuation line: doesn't start with a new SLO code, grade, domain,
      // is not a page number, and is not empty
      let nextLineIdx = lineIdx + 1;
      const maxMerge = 6;
      let mergeCount = 0;

      while (nextLineIdx < lines.length && mergeCount < maxMerge) {
        const nextLine = lines[nextLineIdx].trim();
        if (!nextLine) break;

        const isNewSLO = new RegExp(board.sloRegex.source).test(nextLine);
        const isNewGrade = /^(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/i.test(nextLine);
        const isNewDomain = /^(?:DOMAIN|STRAND|UNIT)\s+[A-Z]\s*[:\-]/i.test(nextLine);
        const isPageNumber = /^\d{1,3}$/.test(nextLine);
        const isHeader = nextLine.length < 5;

        if (isNewSLO || isNewGrade || isNewDomain || isPageNumber || isHeader) break;

        sloText = sloText ? `${sloText} ${nextLine}` : nextLine;
        nextLineIdx++;
        mergeCount++;
      }

      // ── Extract domain from SLO code itself (ground truth) ──
      const codePartsMatch = normalizedCode.match(/^([A-Z]{1,3})-(\d{2})-([A-Z])-(\d{2})$/);
      let codeDomain = currentDomain;
      let codeGrade = currentGrade;
      let codeSubject = subjectCode;

      if (codePartsMatch) {
        codeSubject = codePartsMatch[1];
        codeGrade = normalizeGrade(codePartsMatch[2]);
        codeDomain = codePartsMatch[3];
      }

      // ── Domain orphan check ──
      const hasDeclaredDomains = Object.keys(declaredDomains).length > 0;
      const isOrphan = hasDeclaredDomains && codeDomain && !declaredDomains[codeDomain];

      // ── Truncation detection ──
      const wordCount = sloText.split(/\s+/).filter(Boolean).length;
      const endsWithPunctuation = /[.!?;]$/.test(sloText.trim());
      const isTruncated = wordCount < 4 || (!endsWithPunctuation && wordCount < 8);

      // ── Regex confidence: strict pattern match = 1.0, partial = 0.6 ──
      const regexConfidence = codePartsMatch ? 1.0 : 0.6;

      // ── Page estimate ──
      const absoluteOffset = chunkCharOffset + charPos;
      const pageEstimate = estimatedPages > 0
        ? Math.ceil((absoluteOffset / (text.length + chunkCharOffset)) * estimatedPages)
        : null;

      results.push({
        slo_code: normalizedCode,
        raw_code_as_found: rawCode,
        slo_full_text: sloText || `[Code found: ${normalizedCode} — text not captured]`,
        grade: codeGrade || currentGrade || '',
        domain: codeDomain || currentDomain || '',
        domain_name: declaredDomains[codeDomain] || currentDomainName || `Domain ${codeDomain}`,
        benchmark: currentBenchmark,
        subject: board.subjectCodes[codeSubject] || subjectName,
        subject_code: codeSubject || subjectCode,
        board: boardKey,
        char_offset: absoluteOffset,
        page_number_estimate: pageEstimate || 0,
        is_truncated: isTruncated,
        is_orphan_domain: isOrphan === true,
        regex_confidence: regexConfidence,
      });
    }
  }

  return results;
}

// ── STAGE 3: CONFIDENCE SCORING ───────────────────────────────────────────
function computeConfidence(slo: RawSLO, isOcrReliable: boolean): number {
  const weights = {
    regex:   0.35,
    domain:  0.25,
    boundary: 0.20,
    ocr:     0.20,
  };
  const domainScore = !slo.is_orphan_domain ? 1.0 : 0.2;
  const boundaryScore = slo.is_truncated ? 0.3 : 1.0;
  const ocrScore = isOcrReliable ? 1.0 : 0.6;

  return Math.round((
    (slo.regex_confidence * weights.regex) +
    (domainScore * weights.domain) +
    (boundaryScore * weights.boundary) +
    (ocrScore * weights.ocr)
  ) * 100) / 100;
}

// ── STAGE 4: AI BLOOM ENRICHMENT (lightweight, batch, not primary) ────────
// Sends 15 SLOs at a time for Bloom classification only
// Never extracts — only classifies already-found SLOs
async function enrichWithBloom(
  slos: RawSLO[],
  boardKey: string,
): Promise<Map<string, string>> {
  const bloomMap = new Map<string, string>();
  if (slos.length === 0) return bloomMap;

  const BATCH_SIZE = 15;

  for (let i = 0; i < slos.length; i += BATCH_SIZE) {
    const batch = slos.slice(i, i + BATCH_SIZE);
    const batchList = batch.map((s, idx) =>
      `${idx + 1}. [${s.slo_code}] ${s.slo_full_text}`
    ).join('\n');

    try {
      const result = await neuralGrid.execute(
        `Classify each SLO by Bloom's Taxonomy level.
Return ONLY a JSON object mapping code to level. No explanation.

Levels: Remember | Understand | Apply | Analyze | Evaluate | Create

SLOs:
${batchList}

Return format:
{"B-09-A-01": "Remember", "B-09-A-02": "Apply", ...}`,
        'BLOOM_TAG',
        { temperature: 0.0, maxTokens: 512 }
      );

      const text = result.text.trim().replace(/```json|```/g, '').trim();
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        const parsed = JSON.parse(objMatch[0]);
        for (const [code, level] of Object.entries(parsed)) {
          bloomMap.set(code.toUpperCase(), String(level));
        }
      }
    } catch (err) {
      // Bloom failure is non-fatal — default to 'Understand'
      console.warn(`[Bloom] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed (non-fatal):`, err);
    }

    // Throttle between Bloom batches — avoid rate limits
    if (i + BATCH_SIZE < slos.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return bloomMap;
}

// ── DOMAIN PRE-SCANNER ────────────────────────────────────────────────────
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

// ── DEDUPLICATION ──────────────────────────────────────────────────────────
function deduplicateSLOs(slos: RawSLO[]): { unique: RawSLO[], duplicates: string[] } {
  const seen = new Map<string, RawSLO>();
  const duplicates: string[] = [];

  for (const slo of slos) {
    if (seen.has(slo.slo_code)) {
      duplicates.push(slo.slo_code);
      // Keep the one with longer text (more complete)
      const existing = seen.get(slo.slo_code)!;
      if (slo.slo_full_text.length > existing.slo_full_text.length) {
        seen.set(slo.slo_code, slo);
      }
    } else {
      seen.set(slo.slo_code, slo);
    }
  }

  return { unique: Array.from(seen.values()), duplicates };
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

    // ══════════════════════════════════════════════════════════
    // STAGE 1 — EXTRACT
    // pdf-parse first (free, deterministic)
    // Vision/OCR only if text layer absent or thin
    // ══════════════════════════════════════════════════════════
    if (job.step === IngestionStep.EXTRACT) {
      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching from storage...' });
      await adminSupabase.from('documents').update({ status: 'processing', document_summary: 'Extracting...' }).eq('id', documentId);

      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error('R2_FAULT: File unreachable. Check Cloudflare R2 CORS policy.');

      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 18, message: 'Detecting document type...' });

      const extraction = await smartExtractPDF(buffer, doc.name || 'document.pdf');

      if (!extraction.text || extraction.text.length < 300) {
        throw new Error(`Extraction failed (${extraction.text?.length || 0} chars via ${extraction.method}).`);
      }

      // Board + subject detection
      const sample = (doc.name || '') + ' ' + extraction.text.substring(0, 2000);
      const detectedBoard = detectBoard(sample);
      const detectedSubject = detectSubject(sample);
      const boardInfo = PAKISTAN_BOARDS[detectedBoard] || PAKISTAN_BOARDS['SINDH'];
      const isOcrReliable = extraction.method === 'text';

      // Pre-scan ALL declared domains from full text (done once here, not per chunk)
      const declaredDomains = scanDeclaredDomains(extraction.text);
      const domainCount = Object.keys(declaredDomains).length;

      // Estimate page count from text density (~2000 chars per page)
      const estimatedPages = Math.ceil(extraction.text.length / 2000);

      await adminSupabase.from('documents').update({
        extracted_text: extraction.text, // full text, no truncation
        document_summary: `Extracted|board:${detectedBoard}|subject:${detectedSubject}|method:${extraction.method}|chars:${extraction.text.length}|domains:${domainCount}|pages:~${estimatedPages}`,
      }).eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE,
        progress: 30,
        message: `${boardInfo.name} detected. ${extraction.text.length.toLocaleString()} chars. ${domainCount} domains. ~${estimatedPages} pages.`,
      });

      return NextResponse.json({
        success: true, done: false, step: 'EXTRACT', nextStep: 'LINEARIZE',
        progress: 30,
        board: detectedBoard, boardName: boardInfo.name,
        subject: boardInfo.subjectCodes[detectedSubject] || detectedSubject,
        charCount: extraction.text.length,
        estimatedPages, domainCount, declaredDomains,
        isOcrReliable, method: extraction.method,
        message: `Step 1/3: ${boardInfo.name} | ${extraction.text.length.toLocaleString()} chars | ${domainCount} domains pre-scanned`,
      });
    }

    // ══════════════════════════════════════════════════════════
    // STAGE 2+3 — PARSE + VALIDATE (deterministic, zero AI)
    // One chunk per call — Hobby plan safe (~3s per call)
    // chunkIndex passed in body, state carried forward
    // ══════════════════════════════════════════════════════════
    if (job.step === IngestionStep.LINEARIZE || requestBody.chunkIndex !== undefined) {
      const chunkIndex: number = requestBody.chunkIndex ?? 0;

      const { data: current, error: fetchErr } = await adminSupabase
        .from('documents').select('extracted_text, document_summary').eq('id', documentId).single();
      if (fetchErr) throw new Error(`PARSE_FAULT: DB read failed — ${fetchErr.message}`);

      const rawText = current?.extracted_text || '';
      if (rawText.length < 100) throw new Error(`PARSE_FAULT: No text to parse (${rawText.length} chars).`);

      // Parse metadata from summary string
      const summaryMeta = current?.document_summary || '';
      const boardKey = summaryMeta.match(/board:(\w+)/)?.[1] || detectBoard((doc.name || '') + rawText.substring(0, 1000));
      const subjectCode = summaryMeta.match(/subject:(\w+)/)?.[1] || detectSubject(rawText.substring(0, 1000));
      const estimatedPages = parseInt(summaryMeta.match(/pages:~?(\d+)/)?.[1] || '100');
      const isOcrReliable = summaryMeta.includes('method:text');
      const boardInfo = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS['SINDH'];

      // Restore or build declared domains
      const declaredDomains: Record<string, string> = requestBody.declaredDomains || scanDeclaredDomains(rawText);

      // ── Chunk boundaries ──
      const CHUNK_SIZE = 20000;
      const OVERLAP    = 1500;
      const chunks: Array<{ start: number; end: number }> = [];
      for (let i = 0; i < rawText.length; i += CHUNK_SIZE - OVERLAP) {
        chunks.push({ start: i, end: Math.min(i + CHUNK_SIZE, rawText.length) });
        if (i + CHUNK_SIZE >= rawText.length) break;
      }
      const totalChunks = chunks.length;

      if (chunkIndex >= totalChunks) {
        // All chunks done — proceed to ENRICH
        return NextResponse.json({
          success: true, done: false, step: 'LINEARIZE', nextStep: 'ENRICH',
          progress: 60, totalChunks,
          message: 'All chunks parsed. Starting AI enrichment...',
        });
      }

      const { start, end } = chunks[chunkIndex];
      const chunk = rawText.substring(start, end);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE,
        progress: 32 + Math.round(((chunkIndex + 1) / totalChunks) * 25),
        message: `[${boardKey}] Parsing chunk ${chunkIndex + 1}/${totalChunks}...`,
      });

      // ── STAGE 2: DETERMINISTIC EXTRACTION — zero AI tokens ──
      const rawSLOs = deterministicExtract(
        chunk,
        boardKey,
        declaredDomains,
        subjectCode,
        estimatedPages,
        start, // char offset for page estimation
      );

      // ── STAGE 3: CONFIDENCE SCORING ──
      const scoredSLOs = rawSLOs.map(slo => ({
        ...slo,
        extraction_confidence: computeConfidence(slo, isOcrReliable),
      }));

      // Upsert this chunk's SLOs (no Bloom yet — that's Stage 4)
      if (scoredSLOs.length > 0) {
        const records = scoredSLOs.map(s => ({
          document_id: documentId,
          slo_code: s.slo_code,
          slo_full_text: s.slo_full_text,
          domain: s.domain,
          domain_name: s.domain_name,
          bloom_level: 'Understand', // placeholder — AI enriches in Stage 4
          subject: s.subject,
          grade_level: s.grade,
          extraction_confidence: s.extraction_confidence,
          page_number: s.page_number_estimate || null,
          is_truncated: s.is_truncated,
          is_orphan_domain: s.is_orphan_domain,
          cognitive_complexity: 'Understand',
          teaching_strategies: [],
          assessment_ideas: [],
          prerequisite_concepts: [],
          common_misconceptions: [],
          keywords: [],
        }));

        if (chunkIndex === 0) {
          await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
        }
        // Upsert on slo_code to handle overlap deduplication
        await adminSupabase.from('slo_database')
          .upsert(records, { onConflict: 'document_id,slo_code', ignoreDuplicates: true });
      }

      const isDone = chunkIndex >= totalChunks - 1;

      if (!isDone) {
        return NextResponse.json({
          success: true, done: false,
          step: 'LINEARIZE', nextStep: 'LINEARIZE',
          chunkIndex: chunkIndex + 1,
          totalChunks,
          progress: 32 + Math.round(((chunkIndex + 1) / totalChunks) * 25),
          slosThisChunk: scoredSLOs.length,
          declaredDomains,
          message: `[${boardKey}] Chunk ${chunkIndex + 1}/${totalChunks} — ${scoredSLOs.length} SLOs (deterministic)`,
        });
      }

      // All chunks parsed — count total before enrichment
      const { count: parsedCount } = await adminSupabase
        .from('slo_database').select('*', { count: 'exact', head: true }).eq('document_id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE,
        progress: 60,
        message: `${parsedCount} SLOs parsed deterministically. Starting AI Bloom enrichment...`,
      });

      return NextResponse.json({
        success: true, done: false,
        step: 'LINEARIZE', nextStep: 'ENRICH',
        progress: 60, parsedCount,
        message: `All ${totalChunks} chunks parsed — ${parsedCount} SLOs. Proceeding to Bloom enrichment.`,
      });
    }

    // ══════════════════════════════════════════════════════════
    // STAGE 4 — ENRICH (AI Bloom classification)
    // Called once after all parsing complete
    // Sends SLOs in small batches — rate-limit safe
    // ══════════════════════════════════════════════════════════
    if ((job.step as string) === 'ENRICH' || requestBody.enrichBatch !== undefined) {
      const enrichBatch: number = requestBody.enrichBatch ?? 0;
      const ENRICH_BATCH_SIZE = 15;

      const { data: allSlos } = await adminSupabase
        .from('slo_database')
        .select('id, slo_code, slo_full_text, bloom_level')
        .eq('document_id', documentId)
        .eq('bloom_level', 'Understand') // only unclassified ones
        .range(enrichBatch * ENRICH_BATCH_SIZE, (enrichBatch + 1) * ENRICH_BATCH_SIZE - 1);

      const { count: totalUnclassified } = await adminSupabase
        .from('slo_database').select('*', { count: 'exact', head: true })
        .eq('document_id', documentId).eq('bloom_level', 'Understand');

      const totalBatches = Math.ceil((totalUnclassified || 0) / ENRICH_BATCH_SIZE);

      if (allSlos && allSlos.length > 0) {
        const slosToClassify = allSlos.map(s => ({
          slo_code: s.slo_code,
          slo_full_text: s.slo_full_text,
          regex_confidence: 1,
          // cast to RawSLO-compatible
        } as RawSLO));

        const boardKey = detectBoard((doc.name || '') + '');
        const bloomMap = await enrichWithBloom(slosToClassify, boardKey);

        // Update classified SLOs
        for (const slo of allSlos) {
          const bloom = bloomMap.get(slo.slo_code?.toUpperCase()) || 'Understand';
          if (bloom !== 'Understand') {
            await adminSupabase.from('slo_database')
              .update({ bloom_level: bloom, cognitive_complexity: bloom })
              .eq('id', slo.id);
          }
        }
      }

      const isEnrichDone = !allSlos || allSlos.length === 0 || enrichBatch >= totalBatches - 1;

      if (!isEnrichDone) {
        const progress = 60 + Math.round(((enrichBatch + 1) / Math.max(totalBatches, 1)) * 5);
        return NextResponse.json({
          success: true, done: false,
          step: 'ENRICH', nextStep: 'ENRICH',
          enrichBatch: enrichBatch + 1,
          totalBatches,
          progress,
          message: `Bloom batch ${enrichBatch + 1}/${totalBatches}`,
        });
      }

      // Enrichment complete — get final SLO count
      const { count: finalSloCount } = await adminSupabase
        .from('slo_database').select('*', { count: 'exact', head: true }).eq('document_id', documentId);

      const { data: allSlosForMd } = await adminSupabase
        .from('slo_database').select('*').eq('document_id', documentId);

      const boardKey = detectBoard((doc.name || ''));
      const boardInfo = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS['SINDH'];
      const subjectCode = detectSubject(doc.name || '');

      const markdown = `### ${boardInfo.name} — ${boardInfo.subjectCodes[subjectCode] || 'Curriculum'}\n\n<STRUCTURED_INDEX>\n${JSON.stringify(allSlosForMd, null, 2)}\n</STRUCTURED_INDEX>`;

      await adminSupabase.from('documents').update({
        extracted_text: markdown,
        document_summary: `Linearized — ${finalSloCount} SLOs`,
      }).eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.EMBED,
        progress: 65,
        message: `${finalSloCount} SLOs classified. Building vectors...`,
      });

      return NextResponse.json({
        success: true, done: false,
        step: 'ENRICH', nextStep: 'EMBED',
        progress: 65, finalSloCount,
        message: `Step 3/4 complete — ${finalSloCount} SLOs with Bloom tags.`,
      });
    }

    // ══════════════════════════════════════════════════════════
    // STAGE 5 — EMBED
    // ══════════════════════════════════════════════════════════
    if (job.step === IngestionStep.EMBED) {
      await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 70, message: 'Building vector index...' });

      const { data: finalDoc } = await adminSupabase
        .from('documents').select('extracted_text').eq('id', documentId).single();
      const textToEmbed = finalDoc?.extracted_text || '';
      if (textToEmbed.length < 100) throw new Error('EMBED_FAULT: No text to embed.');

      const result = await indexDocumentForRAG(documentId, textToEmbed, adminSupabase, job.id);
      const chunkCount = result?.count || 0;

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
      } catch (e) { console.warn('[EMBED] Mapping skipped:', e); }

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
    console.error(`[Engine v4] Fatal:`, msg);
    try { await queue.markFailed(job.id, msg); } catch (_) {}
    const { data: cur } = await adminSupabase.from('documents').select('status').eq('id', documentId).single();
    if (cur?.status !== 'ready') {
      await adminSupabase.from('documents').update({
        status: 'failed', document_summary: msg.substring(0, 500),
      }).eq('id', documentId);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
