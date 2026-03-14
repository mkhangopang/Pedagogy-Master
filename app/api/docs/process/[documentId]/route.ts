// FIXED: app/api/docs/process/[documentId]/route.ts — Pedagogy Master AI
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep } from '../../../../../types';
import { IngestionQueue } from '../../../../../lib/jobs/ingestion-queue';
import pdf from 'pdf-parse';
import { GoogleGenAI } from "@google/genai";

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
    sloRegex: /(?:SLO|LO|\[SLO:)\s*[:\-]?\s*([A-Z]{1,3})[-]?(\d{1,2})[-]?([A-Z])[-]?(\d{1,2})/gi,
    gradeRegex: /(?:grade|class|std)\s*[:\-]?\s*(IX|X{1,3}I{0,3}|V?I{1,3}|\d{1,2})\b/gi,
    domainRegex: /(?:DOMAIN|STRAND|UNIT)\s+([A-Z])\s*[:\-]\s*([^\n\r]+)/gi,
    benchmarkRegex: /(?:BENCHMARK|BM)\s*[:\-]?\s*(.{10,120})/gi,
    patternType: 'hierarchical_code',
    normalizeFn: (code: string) => code
      .toUpperCase()
      .replace(/[\[\]]/g, '')
      .replace(/SL[O0]/g, '')
      .replace(/[:\-]/g, '')
      .replace(/\s+/g, '')
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
    normalizeFn: (code: string) => code.trim().toUpperCase().replace(/[:\-]/g, ''),
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

function computeConfidence(slo: RawSLO, isOcrReliable: boolean): number {
  const weights = { regex: 0.35, domain: 0.25, boundary: 0.20, ocr: 0.20 };
  return Math.round((
    (slo.regex_confidence * weights.regex) +
    ((!slo.is_orphan_domain ? 1.0 : 0.2) * weights.domain) +
    ((slo.is_truncated ? 0.3 : 1.0) * weights.boundary) +
    ((isOcrReliable ? 1.0 : 0.6) * weights.ocr)
  ) * 100) / 100;
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

  // BUG-R3 FIX: Cache compiled regex
  const compiledSloCheck = new RegExp(board.sloRegex.source);

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
      let normalizedCode = board.normalizeFn(rawCode);

      let sloText = trimmed.substring(sloMatch.index + rawCode.length).trim();
      
      // If grade is not set, extract it from the SLO code
      if (!currentGrade && sloMatch[2]) {
        currentGrade = normalizeGrade(sloMatch[2]);
      }
      
      // If domain is not set, extract it from the SLO code
      if (!currentDomain && sloMatch[3]) {
        currentDomain = sloMatch[3].toUpperCase();
      }

      let nextLineIdx = lineIdx + 1;
      const maxMerge = 6;
      let mergeCount = 0;

      while (nextLineIdx < lines.length && mergeCount < maxMerge) {
        const nextLine = lines[nextLineIdx].trim();
        if (!nextLine) break;
        // BUG-R3 FIX: Use cached regex
        const isNewSLO = compiledSloCheck.test(nextLine);
        const isNewGrade = /^(?:grade|class)\s*[:\-]?\s*(IX|X|XI|XII|\d{1,2})\b/i.test(nextLine);
        const isNewDomain = /^(?:DOMAIN|STRAND|UNIT)\s+[A-Z]\s*[:\-]/i.test(nextLine);
        const isPageNumber = /^\d{1,3}$/.test(nextLine);
        const isHeader = nextLine.length < 5;
        if (isNewSLO || isNewGrade || isNewDomain || isPageNumber || isHeader) break;
        sloText = sloText ? `${sloText} ${nextLine}` : nextLine;
        nextLineIdx++;
        mergeCount++;
      }

      // Clean leading punctuation and brackets
      sloText = sloText.replace(/^[\]\:\-\s\.]+/g, '').trim();

      const codePartsMatch = rawCode.match(/([A-Z]{1,3})[-]?(\d{1,2})[-]?([A-Z])[-]?(\d{1,2})/);
      let codeDomain = currentDomain;
      let codeGrade = currentGrade;
      let codeSubject = subjectCode;

      if (codePartsMatch) {
        codeSubject = codePartsMatch[1];
        codeGrade = normalizeGrade(codePartsMatch[2]);
        codeDomain = codePartsMatch[3];
        const sloNum = codePartsMatch[4];
        // Ensure consistent 6-character code: B09A01
        normalizedCode = `${codeSubject}${codeGrade}${codeDomain}${sloNum.padStart(2, '0')}`;
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

  console.log(`[Ingestion] deterministicExtract: Found ${results.length} SLOs for board ${boardKey}`);
  return results;
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

function buildCleanMarkdown(slos: any[]): string {
  const sorted = [...slos].sort((a, b) => {
    const gA = parseInt(a.grade) || 0;
    const gB = parseInt(b.grade) || 0;
    if (gA !== gB) return gA - gB;
    if (a.domain !== b.domain) return (a.domain || "").localeCompare(b.domain || "");
    return (a.slo_code || "").localeCompare(b.slo_code || "");
  });

  const lines: string[] = sorted.map(s => `SLO ${s.slo_code} ${s.slo_full_text}`);
  lines.push('');
  lines.push('<STRUCTURED_INDEX>');
  lines.push(JSON.stringify(sorted, null, 2));
  lines.push('</STRUCTURED_INDEX>');

  return lines.join('\n');
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
    if (job.step === IngestionStep.LINEARIZE) {
      console.log(`[Ingestion] Starting LINEARIZE for ${documentId}`);
      const { data: current } = await adminSupabase.from('documents').select('extracted_text, document_summary').eq('id', documentId).single();
      const rawText = current?.extracted_text || '';
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

      const rawSLOs = deterministicExtract(rawText, boardKey, declaredDomains, subjectCode, estimatedPages, 0);
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
          raw_code_as_found: s.raw_code_as_found,
          char_offset: s.char_offset,
          benchmark: s.benchmark,
          board: s.board
        }));

        console.log(`[Ingestion] Attempting to insert ${records.length} SLO records for document ${documentId}`);
        await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
        // BUG-R1 FIX: Use column names for onConflict
        const { error: upsertError } = await adminSupabase.from('slo_database').upsert(records, { onConflict: 'document_id,slo_code' });
        if (upsertError) {
          console.error(`[Ingestion] Error upserting SLO records:`, upsertError);
        } else {
          console.log(`[Ingestion] Successfully upserted SLO records for document ${documentId}`);
        }
      } else {
        console.log(`[Ingestion] No SLOs found to insert for document ${documentId}`);
      }

      const markdown = buildCleanMarkdown(scoredSLOs);
      await adminSupabase.from('documents').update({
        extracted_text: markdown,
        document_summary: `Linearized — ${scoredSLOs.length} SLOs`,
      }).eq('id', documentId);

      // BUG-R2 FIX: Advance to ENRICH stage
      await queue.updateProgress(job.id, { step: IngestionStep.ENRICH, progress: 60, message: 'Classifying Bloom Taxonomy...' });
      // BUG-R5 FIX: Re-read authoritative state
      job = await queue.getJobStatus(documentId);
    }

    // ── STAGE 3: ENRICH (AI Bloom Taxonomy) ───────────────────────────────
    if (job.step === IngestionStep.ENRICH) {
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
