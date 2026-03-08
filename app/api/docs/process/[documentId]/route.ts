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
// UNIVERSAL CURRICULUM INGESTION ENGINE v4.1
// ─────────────────────────────────────────────────────────────────────
// Stage 1 — EXTRACT  : pdf-parse (deterministic) → Vision fallback
// Stage 2 — PARSE    : Regex state-machine (zero AI tokens)
// Stage 3 — ENRICH   : AI batch Bloom classification (lightweight)
// Stage 4 — EMBED    : Vector indexing
//
// ROUTING LOGIC (key fix v4.1):
//   body.enrichBatch !== undefined  → always goes to ENRICH
//   body.embedStep === true         → always goes to EMBED
//   body.chunkIndex !== undefined   → goes to PARSE (unless above)
//   job.step === EXTRACT            → EXTRACT
//   job.step === EMBED              → EMBED
// ═══════════════════════════════════════════════════════════════════════

const PAKISTAN_BOARDS: Record<string, {
  name: string;
  subjectCodes: Record<string, string>;
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
    sloRegex: /(?:SL[O0]\s*[:\-]?\s*)?([A-Z]{1,3})-(\d{1,2})-([A-Z])-(\d{1,2})/g,
    gradeRegex: /(?:grade|class|std)\s*[:\-]?\s*(IX|X{1,3}I{0,3}|V?I{1,3}|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*([^\n\r]{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: (code: string) => code
      .toUpperCase()
      .replace(/SL0/g, 'SLO')
      .replace(/\s+/g, '')
      .replace(/-(\d)-/g, (_, n) => `-${n.padStart(2, '0')}-`)
      .replace(/-(\d)$/, (_, n) => `-${n.padStart(2, '0')}`)
      .trim(),
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

  let currentGrade = '';
  let currentDomain = '';
  let currentDomainName = '';
  let currentBenchmark = '';

  const lines = text.split(/\r?\n/);
  let charPos = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();
    charPos += line.length + 1;

    const gradeMatch = trimmed.match(/(?:grade|class|std)\s*[:\-]?\s*(IX|X{1,3}I{0,3}|V?I{1,3}|\d{1,2})\b/i);
    if (gradeMatch) { currentGrade = normalizeGrade(gradeMatch[1]); continue; }

    const domainMatch = trimmed.match(/(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*(.+)/i);
    if (domainMatch) {
      currentDomain = domainMatch[1].toUpperCase();
      currentDomainName = domainMatch[2].trim();
      if (!declaredDomains[currentDomain]) declaredDomains[currentDomain] = currentDomainName;
      continue;
    }

    const bmMatch = trimmed.match(/(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/i);
    if (bmMatch) { currentBenchmark = bmMatch[1].trim(); continue; }

    const sloRegex = new RegExp(board.sloRegex.source, 'g');
    let sloMatch;
    while ((sloMatch = sloRegex.exec(trimmed)) !== null) {
      const rawCode = sloMatch[0];
      const normalizedCode = board.normalizeFn(rawCode);

      let sloText = trimmed.substring(sloMatch.index + rawCode.length).trim();

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

      const codePartsMatch = normalizedCode.match(/^([A-Z]{1,3})-(\d{2})-([A-Z])-(\d{2})$/);
      let codeDomain = currentDomain;
      let codeGrade = currentGrade;
      let codeSubject = subjectCode;

      if (codePartsMatch) {
        codeSubject = codePartsMatch[1];
        codeGrade = normalizeGrade(codePartsMatch[2]);
        codeDomain = codePartsMatch[3];
      }

      const hasDeclaredDomains = Object.keys(declaredDomains).length > 0;
      const isOrphan: boolean = !!(hasDeclaredDomains && codeDomain && !declaredDomains[codeDomain]);

      const wordCount = sloText.split(/\s+/).filter(Boolean).length;
      const endsWithPunctuation = /[.!?;]$/.test(sloText.trim());
      const isTruncated = wordCount < 4 || (!endsWithPunctuation && wordCount < 8);

      const regexConfidence = codePartsMatch ? 1.0 : 0.6;

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
        is_orphan_domain: isOrphan,
        regex_confidence: regexConfidence,
      });
    }
  }

  return results;
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

async function enrichWithBloom(slos: RawSLO[]): Promise<Map<string, string>> {
  const bloomMap = new Map<string, string>();
  if (slos.length === 0) return bloomMap;

  const batchList = slos.map((s, i) =>
    `${i + 1}. [${s.slo_code}] ${s.slo_full_text}`
  ).join('\n');

  // Context-based Bloom classifier — reads cognitive demand, not just verb
  try {
    const result = await neuralGrid.execute(
      `You are an expert educational taxonomist for Pakistan Sindh curriculum.

Classify each SLO by Bloom\'s Revised Taxonomy. DO NOT classify by verb alone.

CRITICAL RULES:
1. Read the FULL statement. Assess cognitive demand, not just the action verb.
2. "Explain" = Understand when paraphrasing a concept. = Analyze when breaking down a mechanism.
3. "Identify" = Remember when recalling a name. = Analyze when finding causes/patterns.
4. "Define" alone = Remember. "Define and apply" = Understand.
5. Biology mechanisms (photosynthesis, respiration, genetics processes) = Analyze.
6. Calculations, experiments, graph plotting = Apply.
7. Grade 9-10: default Remember/Understand/Apply unless content demands higher.
8. Grade 11-12: default Apply/Analyze unless purely definitional.
9. "Appreciate", "realize", "justify" = Evaluate.
10. "Design", "propose hypothesis", "formulate" = Create.

LEVELS:
- Remember   : Recall facts/definitions/names without requiring comprehension
- Understand : Explain WHY/HOW in own words, summarize, classify, compare
- Apply      : Use knowledge in new context, solve, calculate, demonstrate
- Analyze    : Examine mechanisms, identify cause/effect, break down processes
- Evaluate   : Judge, assess evidence, critique, justify conclusions
- Create     : Design, formulate hypotheses, synthesize new solutions

Return ONLY raw JSON object. No markdown. No explanation.
Format: {"B-09-A-01": "Analyze", "B-10-B-03": "Remember"}

SLOs:
${batchList}`,
      'BLOOM_TAG',
      { temperature: 0.0, maxTokens: 1024 }
    );

    const cleaned = result.text.trim().replace(/\`\`\`json|\`\`\`/g, '').trim();
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]);
      const validLevels = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
      for (const [code, level] of Object.entries(parsed)) {
        const normalized = String(level).trim();
        const matched = validLevels.find(l => l.toLowerCase() === normalized.toLowerCase());
        bloomMap.set(code.toUpperCase(), matched || 'Understand');
      }
    }
  } catch (err) {
    console.warn(`[Bloom] Failed (non-fatal):`, err);
  }

  return bloomMap;
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

  // ── Explicit body flags take priority over job.step ──────────────────
  // This is the key routing fix — body always wins over DB state
  const isEnrichCall = requestBody.enrichBatch !== undefined;
  const isEmbedCall  = requestBody.embedStep === true;
  const isParseCall  = requestBody.chunkIndex !== undefined && !isEnrichCall && !isEmbedCall;

  let job = await queue.getJobStatus(documentId).catch((e: any) => {
    throw new Error('QUEUE_FAULT: ' + (e.message || 'ingestion_jobs table missing'));
  });
  if (!job) {
    const jobId = await queue.enqueue(documentId).catch((e: any) => {
      throw new Error('ENQUEUE_FAULT: ' + (e.message || 'Cannot insert job'));
    });
    job = { id: jobId, step: IngestionStep.EXTRACT };
  }

  if (job.step === IngestionStep.COMPLETE) {
    return NextResponse.json({ success: true, done: true, step: 'COMPLETE', progress: 100 });
  }

  try {
    const { data: doc } = await adminSupabase
      .from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error('VAULT_ERROR: Document not found.');

    // ── STAGE 1: EXTRACT ──────────────────────────────────────────────────
    if (job.step === IngestionStep.EXTRACT && !isParseCall && !isEnrichCall && !isEmbedCall) {
      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching from storage...' });
      await adminSupabase.from('documents').update({ status: 'processing', document_summary: 'Extracting...' }).eq('id', documentId);

      // Use r2_key if available, fall back to file_path
      const r2Path = doc.r2_key || doc.file_path;
      if (!r2Path) throw new Error('R2_FAULT: No file path stored for this document.');

      // Race R2 fetch against 25s deadline — prevents timeout on large PDFs
      const bufferRaw = await Promise.race([
        getObjectBuffer(r2Path),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('R2_TIMEOUT: Storage fetch took >25s. Try a smaller PDF.')), 25000))
      ]);
      const buffer = bufferRaw as Buffer;
      if (!buffer) throw new Error('R2_FAULT: File unreachable. Check Cloudflare R2 CORS policy.');

      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 18, message: 'Detecting document type...' });

      // Race pdf-parse against 25s — Vision fallback skipped on Hobby plan (too slow)
      let extraction: { text: string; method: string };
      try {
        const pdf = (await import('pdf-parse')).default;
        const parseResult = await Promise.race([
          pdf(buffer),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PDF_PARSE_TIMEOUT')), 25000))
        ]);
        const text = (parseResult as any).text?.trim() || '';
        const meaningfulLines = text.split('\n').filter((l: string) => l.trim().length > 15).length;
        if (text.length > 500 && meaningfulLines > 10) {
          extraction = { text, method: 'text' };
        } else {
          throw new Error(`Low quality text (${text.length} chars, ${meaningfulLines} lines)`);
        }
      } catch (pdfErr: any) {
        // If pdf-parse fails or times out, use Vision — but warn it may be slow
        console.warn('[EXTRACT] pdf-parse failed, trying Vision:', pdfErr.message);
        const visionResult = await smartExtractPDF(buffer, doc.name || 'document.pdf');
        extraction = visionResult;
      }

      if (!extraction.text || extraction.text.length < 300) {
        throw new Error(`Extraction failed (${extraction.text?.length || 0} chars via ${extraction.method}).`);
      }

      const sample = (doc.name || '') + ' ' + extraction.text.substring(0, 2000);
      const detectedBoard = detectBoard(sample);
      const detectedSubject = detectSubject(sample);
      const boardInfo = PAKISTAN_BOARDS[detectedBoard] || PAKISTAN_BOARDS['SINDH'];
      const declaredDomains = scanDeclaredDomains(extraction.text);
      const domainCount = Object.keys(declaredDomains).length;
      const estimatedPages = Math.ceil(extraction.text.length / 2000);

      await adminSupabase.from('documents').update({
        extracted_text: extraction.text,
        document_summary: `Extracted|board:${detectedBoard}|subject:${detectedSubject}|method:${extraction.method}|chars:${extraction.text.length}|domains:${domainCount}|pages:~${estimatedPages}`,
      }).eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE,
        progress: 30,
        message: `${boardInfo.name} | ${extraction.text.length.toLocaleString()} chars | ${domainCount} domains`,
      });

      return NextResponse.json({
        success: true, done: false, step: 'EXTRACT', nextStep: 'LINEARIZE',
        progress: 30,
        board: detectedBoard, boardName: boardInfo.name,
        subject: boardInfo.subjectCodes[detectedSubject] || detectedSubject,
        charCount: extraction.text.length,
        estimatedPages, domainCount, declaredDomains,
        isOcrReliable: extraction.method === 'text',
        method: extraction.method,
        message: `Stage 1 ✅ ${boardInfo.name} | ${extraction.text.length.toLocaleString()} chars | ${domainCount} domains`,
      });
    }

    // ── STAGE 2: PARSE — deterministic regex, zero AI ─────────────────────
    if (isParseCall || (job.step === IngestionStep.LINEARIZE && !isEnrichCall && !isEmbedCall)) {
      const chunkIndex: number = requestBody.chunkIndex ?? 0;

      const { data: current, error: fetchErr } = await adminSupabase
        .from('documents').select('extracted_text, document_summary').eq('id', documentId).single();
      if (fetchErr) throw new Error(`PARSE_FAULT: DB read failed — ${fetchErr.message}`);

      const rawText = current?.extracted_text || '';
      if (rawText.length < 100) throw new Error(`PARSE_FAULT: No text (${rawText.length} chars).`);

      const summaryMeta = current?.document_summary || '';
      const boardKey = summaryMeta.match(/board:(\w+)/)?.[1] || detectBoard((doc.name || '') + rawText.substring(0, 1000));
      const subjectCode = summaryMeta.match(/subject:(\w+)/)?.[1] || detectSubject(rawText.substring(0, 1000));
      const estimatedPages = parseInt(summaryMeta.match(/pages:~?(\d+)/)?.[1] || '100');
      const isOcrReliable = summaryMeta.includes('method:text');
      const boardInfo = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS['SINDH'];
      const declaredDomains: Record<string, string> = requestBody.declaredDomains || scanDeclaredDomains(rawText);

      const CHUNK_SIZE = 20000;
      const OVERLAP    = 1500;
      const chunks: Array<{ start: number; end: number }> = [];
      for (let i = 0; i < rawText.length; i += CHUNK_SIZE - OVERLAP) {
        chunks.push({ start: i, end: Math.min(i + CHUNK_SIZE, rawText.length) });
        if (i + CHUNK_SIZE >= rawText.length) break;
      }
      const totalChunks = chunks.length;

      if (chunkIndex >= totalChunks) {
        const { count: parsedCount } = await adminSupabase
          .from('slo_database').select('*', { count: 'exact', head: true }).eq('document_id', documentId);
        // Advance job step so ENRICH call won't fall back to PARSE
        await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 60, message: `${parsedCount} SLOs parsed. Enriching...` });
        return NextResponse.json({
          success: true, done: false, step: 'LINEARIZE', nextStep: 'ENRICH',
          progress: 60, parsedCount, totalChunks,
          message: `All ${totalChunks} chunks parsed — ${parsedCount} SLOs.`,
        });
      }

      const { start, end } = chunks[chunkIndex];
      const chunk = rawText.substring(start, end);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE,
        progress: 32 + Math.round(((chunkIndex + 1) / totalChunks) * 25),
        message: `[${boardKey}] Chunk ${chunkIndex + 1}/${totalChunks}...`,
      });

      const rawSLOs = deterministicExtract(chunk, boardKey, declaredDomains, subjectCode, estimatedPages, start);
      const scoredSLOs = rawSLOs.map(slo => ({
        ...slo,
        extraction_confidence: computeConfidence(slo, isOcrReliable),
      }));

      if (scoredSLOs.length > 0) {
        const records = scoredSLOs.map(s => ({
          document_id: documentId,
          slo_code: s.slo_code,
          slo_full_text: s.slo_full_text,
          domain: s.domain,
          domain_name: s.domain_name,
          bloom_level: 'Understand',
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
          message: `[${boardKey}] Chunk ${chunkIndex + 1}/${totalChunks} — ${scoredSLOs.length} SLOs`,
        });
      }

      // Last chunk — advance job step and signal ENRICH
      const { count: parsedCount } = await adminSupabase
        .from('slo_database').select('*', { count: 'exact', head: true }).eq('document_id', documentId);
      await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 60, message: `${parsedCount} SLOs parsed. Enriching...` });

      return NextResponse.json({
        success: true, done: false,
        step: 'LINEARIZE', nextStep: 'ENRICH',
        progress: 60, parsedCount,
        message: `All ${totalChunks} chunks parsed — ${parsedCount} SLOs.`,
      });
    }

    // ── STAGE 3: ENRICH — AI Bloom (batched, non-fatal) ──────────────────
    if (isEnrichCall) {
      const enrichBatch: number = requestBody.enrichBatch ?? 0;
      const ENRICH_BATCH_SIZE = 15;

      const { data: batchSlos } = await adminSupabase
        .from('slo_database')
        .select('id, slo_code, slo_full_text, bloom_level')
        .eq('document_id', documentId)
        .eq('bloom_level', 'Understand')
        .range(enrichBatch * ENRICH_BATCH_SIZE, (enrichBatch + 1) * ENRICH_BATCH_SIZE - 1);

      const { count: totalUnclassified } = await adminSupabase
        .from('slo_database').select('*', { count: 'exact', head: true })
        .eq('document_id', documentId).eq('bloom_level', 'Understand');

      const totalBatches = Math.ceil((totalUnclassified || 0) / ENRICH_BATCH_SIZE);

      if (batchSlos && batchSlos.length > 0) {
        const slosToClassify = batchSlos.map(s => ({
          slo_code: s.slo_code,
          slo_full_text: s.slo_full_text,
          regex_confidence: 1,
        } as RawSLO));

        const bloomMap = await enrichWithBloom(slosToClassify);

        for (const slo of batchSlos) {
          const bloom = bloomMap.get(slo.slo_code?.toUpperCase()) || 'Understand';
          if (bloom !== 'Understand') {
            await adminSupabase.from('slo_database')
              .update({ bloom_level: bloom, cognitive_complexity: bloom })
              .eq('id', slo.id);
          }
        }
      }

      const isEnrichDone = !batchSlos || batchSlos.length === 0 || enrichBatch >= totalBatches - 1;

      if (!isEnrichDone) {
        return NextResponse.json({
          success: true, done: false,
          step: 'ENRICH', nextStep: 'ENRICH',
          enrichBatch: enrichBatch + 1,
          totalBatches,
          progress: 60 + Math.round(((enrichBatch + 1) / Math.max(totalBatches, 1)) * 5),
          message: `Bloom batch ${enrichBatch + 1}/${totalBatches}`,
        });
      }

      // All Bloom batches done
      const { count: finalSloCount } = await adminSupabase
        .from('slo_database').select('*', { count: 'exact', head: true }).eq('document_id', documentId);

      const { data: allSlosForMd } = await adminSupabase
        .from('slo_database').select('*').eq('document_id', documentId);

      const boardKey = detectBoard(doc.name || '');
      const boardInfo = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS['SINDH'];
      const subjectCode = detectSubject(doc.name || '');
      const markdown = `### ${boardInfo.name} — ${boardInfo.subjectCodes[subjectCode] || 'Curriculum'}\n\n<STRUCTURED_INDEX>\n${JSON.stringify(allSlosForMd, null, 2)}\n</STRUCTURED_INDEX>`;

      await adminSupabase.from('documents').update({
        extracted_text: markdown,
        document_summary: `Linearized — ${finalSloCount} SLOs`,
      }).eq('id', documentId);

      // Keep job.step at EMBED (already set) so EMBED call routes correctly
      return NextResponse.json({
        success: true, done: false,
        step: 'ENRICH', nextStep: 'EMBED',
        progress: 65, finalSloCount,
        message: `Stage 3 ✅ ${finalSloCount} SLOs classified. Building vectors...`,
      });
    }

    // -- STAGE 4: EMBED (non-fatal, timeout-safe) ----------------------------
    if (isEmbedCall || job.step === IngestionStep.EMBED) {
      await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 75, message: 'Finalising document...' });

      // Count SLOs already written to slo_database (by ENRICH stage)
      const { count: sloCount } = await adminSupabase
        .from('slo_database')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', documentId);

      // Try vector indexing — but treat it as OPTIONAL.
      // If it times out or fails, we still mark the document ready.
      let chunkCount = 0;
      try {
        const { data: finalDoc } = await adminSupabase
          .from('documents').select('extracted_text').eq('id', documentId).single();
        const textToEmbed = finalDoc?.extracted_text || '';

        if (textToEmbed.length >= 100) {
          // Race the indexer against a 45s deadline so we always respond before Vercel kills us
          const TIMEOUT_MS = 45000;
          const indexPromise = indexDocumentForRAG(documentId, textToEmbed, adminSupabase, job.id);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('EMBED_TIMEOUT')), TIMEOUT_MS)
          );
          const result = await Promise.race([indexPromise, timeoutPromise]) as any;
          chunkCount = result?.count || 0;

          // Map chunks to SLOs — non-fatal
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
              if (mappings.length > 0) {
                await adminSupabase.from('chunk_slo_mapping').insert(mappings).throwOnError();
              }
            }
          } catch (_) { /* mapping is optional — do not block completion */ }
        }
      } catch (embedErr: any) {
        // Timeout or embedding service down — log it but do NOT fail the ingestion
        console.warn('[EMBED] Vector indexing skipped:', embedErr.message);
        chunkCount = 0;
      }

      // Always mark complete regardless of embedding outcome
      await queue.markComplete(job.id);
      await adminSupabase.from('documents').update({
        status: 'ready',
        rag_indexed: chunkCount > 0,
        document_summary: chunkCount > 0
          ? 'Ready -- ' + (sloCount || 0) + ' SLOs, ' + chunkCount + ' vectors'
          : 'Ready -- ' + (sloCount || 0) + ' SLOs extracted',
      }).eq('id', documentId);

      return NextResponse.json({
        success: true, done: true, step: 'EMBED', progress: 100,
        chunkCount, sloCount: sloCount || 0,
        message: 'Stage 4 complete -- ' + (sloCount || 0) + ' SLOs ready.',
      });
    }
    return NextResponse.json({ error: 'Unknown step', step: job.step }, { status: 400 });

  } catch (err: any) {
    const msg = err.message || 'Processing failed.';
    const stack = err.stack?.substring(0, 300) || '';
    console.error(`[Engine v4.1] Fatal:`, msg, stack);
    try { await queue.markFailed(job.id, msg); } catch (_) {}
    try {
      const { data: cur } = await adminSupabase.from('documents').select('status').eq('id', documentId).single();
      if (cur?.status !== 'ready') {
        await adminSupabase.from('documents').update({
          status: 'failed', document_summary: msg.substring(0, 500),
        }).eq('id', documentId);
      }
    } catch (_) {}
    return NextResponse.json({ error: msg, hint: stack.split('\n')[0] }, { status: 500 });
  }
}
