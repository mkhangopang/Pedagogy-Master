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

// ═══════════════════════════════════════════════════════════════
// PAKISTAN CURRICULUM REGISTRY v1.0
// Based on Sindh Biology 2024 as reference implementation
// Extensible to Punjab, FBISE, KPK, Balochistan
// ═══════════════════════════════════════════════════════════════

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
    // Core Sindh SLO pattern: B-09-A-01 or SLO:B-09-A-01 or SLO B-09-A-01
    sloPattern: /(?:SLO\s*[:\-]?\s*)?([A-Z]{1,3})-(\d{1,2})-([A-Z])-(\d{2})/g,
    // Grade headings: Grade 9, Grade IX, Class 9, Class IX
    gradePattern: /(?:grade|class)\s*:?\s*(IX|X|XI|XII|\d{1,2})/gi,
    // Domain headings: DOMAIN A: ... or Domain A -
    domainPattern: /DOMAIN\s+([A-Z])\s*[:\-]\s*(.+)/gi,
    patternType: 'hierarchical_code',
    normalization: (code: string) => {
      // Normalize: SL0 → SLO, roman numerals in code, spacing
      return code
        .replace(/SL0/g, 'SLO')           // OCR fix: zero → O
        .replace(/\s+/g, '')               // remove spaces
        .toUpperCase()
        .trim();
    },
  },
  PUNJAB: {
    name: 'Punjab Curriculum & Textbook Board',
    subjectCodes: { 'B': 'Biology', 'P': 'Physics', 'C': 'Chemistry', 'M': 'Mathematics' },
    sloPattern: /(?:SLO|LO|Outcome)\s*[:\-]?\s*(\d+)\.(\d+)\.(\d+)/g,
    gradePattern: /(?:grade|class)\s*:?\s*(IX|X|XI|XII|\d{1,2})/gi,
    domainPattern: /(?:UNIT|CHAPTER|TOPIC)\s+(\d+)\s*[:\-]\s*(.+)/gi,
    patternType: 'decimal',
    normalization: (code: string) => code.trim().toUpperCase(),
  },
};

// Roman numeral → integer grade mapping
const ROMAN_TO_GRADE: Record<string, string> = {
  'I': '01', 'II': '02', 'III': '03', 'IV': '04', 'V': '05',
  'VI': '06', 'VII': '07', 'VIII': '08', 'IX': '09', 'X': '10',
  'XI': '11', 'XII': '12',
};

// ═══════════════════════════════════════════════════════════════
// STATE MACHINE — tracks context across chunks
// ═══════════════════════════════════════════════════════════════
interface CurriculumState {
  board: string;
  subject: string;
  currentGrade: string;
  currentDomain: string;
  currentDomainName: string;
  currentBenchmark: string;
  detectedSubjectCode: string;
}

function detectBoard(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('sindh') || lower.includes('stbb') || lower.includes('stbe')) return 'SINDH';
  if (lower.includes('punjab') || lower.includes('pctb')) return 'PUNJAB';
  if (lower.includes('federal') || lower.includes('fbise')) return 'FBISE';
  if (lower.includes('kpk') || lower.includes('khyber')) return 'KPK';
  return 'SINDH'; // Default: Sindh as primary target
}

function detectSubjectCode(text: string, boardKey: string): string {
  const board = PAKISTAN_BOARDS[boardKey];
  if (!board) return 'B';
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

// ═══════════════════════════════════════════════════════════════
// VALIDATION LAYER
// ═══════════════════════════════════════════════════════════════
interface ValidationReport {
  duplicates: string[];
  malformed: string[];
  domainMismatches: string[];
  totalExtracted: number;
  totalValid: number;
}

function validateSLOs(slos: any[], boardKey: string): { valid: any[], report: ValidationReport } {
  const board = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS['SINDH'];
  const seen = new Set<string>();
  const valid: any[] = [];
  const report: ValidationReport = {
    duplicates: [], malformed: [], domainMismatches: [], totalExtracted: slos.length, totalValid: 0,
  };

  for (const slo of slos) {
    const code = (slo.slo_code || '').toUpperCase().trim();
    if (!code) { report.malformed.push('empty code'); continue; }

    // Check for duplicates
    if (seen.has(code)) { report.duplicates.push(code); continue; }

    // Validate against Sindh pattern: SUBJ-GRADE-DOMAIN-SEQ
    const sindhMatch = code.match(/^([A-Z]{1,3})-(\d{2})-([A-Z])-(\d{2})$/) ||
                       code.match(/^SLO:([A-Z]{1,3})-(\d{2})-([A-Z])-(\d{2})$/) ||
                       code.match(/^SLO:([A-Z])-(\d{1,2})-([A-Z])-(\d{1,2})$/);

    if (!sindhMatch && boardKey === 'SINDH') {
      report.malformed.push(code);
      // Still include — flag but don't discard
    }

    seen.add(code);
    valid.push({ ...slo, slo_code: code });
  }

  report.totalValid = valid.length;
  return { valid, report };
}

// ═══════════════════════════════════════════════════════════════
// CHUNK PROCESSOR — One chunk per Vercel call (Hobby plan fix)
// ═══════════════════════════════════════════════════════════════
async function processOneChunk(
  content: string,
  chunkIndex: number,
  state: CurriculumState,
): Promise<{ slos: any[], totalChunks: number, isDone: boolean, nextState: CurriculumState }> {

  const CHUNK_SIZE = 18000;
  const OVERLAP    = 1000; // Larger overlap to catch multi-line SLOs at boundaries

  const chunks: Array<{ start: number, end: number }> = [];
  for (let i = 0; i < content.length; i += CHUNK_SIZE - OVERLAP) {
    chunks.push({ start: i, end: Math.min(i + CHUNK_SIZE, content.length) });
    if (i + CHUNK_SIZE >= content.length) break;
  }

  const totalChunks = chunks.length;
  if (chunkIndex >= totalChunks) {
    return { slos: [], totalChunks, isDone: true, nextState: state };
  }

  const { start, end } = chunks[chunkIndex];
  const chunk = content.substring(start, end);

  console.log(`[Pakistan Engine] Chunk ${chunkIndex + 1}/${totalChunks} | Board:${state.board} Subject:${state.subject} | ${chunk.length} chars`);

  // ── Update state from this chunk (state machine transition) ──
  const nextState = { ...state };

  // Detect grade transitions in this chunk
  const gradeMatches = [...chunk.matchAll(/(?:grade|class)\s*:?\s*(IX|X{0,3}I{0,3}|V?I{0,3}|\d{1,2})/gi)];
  if (gradeMatches.length > 0) {
    const lastGrade = gradeMatches[gradeMatches.length - 1][1];
    nextState.currentGrade = normalizeGrade(lastGrade);
  }

  // Detect domain transitions
  const domainMatches = [...chunk.matchAll(/DOMAIN\s+([A-Z])\s*[:\-]\s*([^\n]+)/gi)];
  if (domainMatches.length > 0) {
    const lastDomain = domainMatches[domainMatches.length - 1];
    nextState.currentDomain = lastDomain[1].toUpperCase();
    nextState.currentDomainName = lastDomain[2].trim();
  }

  // ── Build Sindh-specific extraction prompt ──
  const prompt = `You are a Pakistan curriculum SLO extraction engine for ${state.board} board.

STRICT RULES — NEVER VIOLATE:
1. Extract ONLY explicitly written SLO codes. NEVER invent or continue sequences.
2. Sindh SLO format: SUBJECT-GRADE-DOMAIN-SEQ (e.g., B-09-A-01 or SLO:B-09-A-01)
3. Normalize Roman numerals: IX→09, X→10, XI→11, XII→12
4. Fix OCR typos: SL0 (zero) → SLO, but only if clearly a code
5. Multi-line SLOs: merge continuation lines into single slo_full_text
6. If grade/domain heading appears mid-chunk, update context for subsequent SLOs
7. Return [] if no valid SLO codes exist in this chunk

CURRENT STATE CONTEXT (from previous chunks):
- Board: ${state.board} (${PAKISTAN_BOARDS[state.board]?.name || 'Sindh Textbook Board'})
- Subject: ${state.subject}
- Last known grade: ${state.currentGrade || 'unknown'}
- Last known domain: ${state.currentDomain || 'unknown'} — ${state.currentDomainName || ''}

RETURN FORMAT — raw JSON array only, no markdown, no explanation:
[
  {
    "slo_code": "B-09-A-01",
    "slo_full_text": "Complete multi-line merged objective text",
    "bloom_level": "Remember|Understand|Apply|Analyze|Evaluate|Create",
    "subject": "${state.subject}",
    "subject_code": "${state.detectedSubjectCode}",
    "grade": "09",
    "domain": "A",
    "domain_name": "Nature of Science in Biology",
    "board": "${state.board}",
    "raw_code_as_found": "exact code as it appears in document"
  }
]

CURRICULUM CHUNK ${chunkIndex + 1}/${totalChunks}:
${chunk}`;

  const result = await neuralGrid.execute(prompt, 'INGEST_LINEARIZE', { temperature: 0.0, maxTokens: 4096 });

  let slos: any[] = [];
  try {
    const text = result.text.trim().replace(/```json|```/g, '').trim();
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) slos = parsed;
    }
  } catch (e) {
    console.warn(`[Pakistan Engine] Chunk ${chunkIndex + 1} parse failed — continuing`);
  }

  // Post-process: normalize codes using board rules
  const board = PAKISTAN_BOARDS[state.board] || PAKISTAN_BOARDS['SINDH'];
  slos = slos.map(s => ({
    ...s,
    slo_code: board.normalization(s.slo_code || ''),
    grade: normalizeGrade(s.grade || nextState.currentGrade || ''),
  })).filter(s => s.slo_code.length > 0);

  console.log(`[Pakistan Engine] Chunk ${chunkIndex + 1}: ${slos.length} SLOs | grade:${nextState.currentGrade} domain:${nextState.currentDomain}`);

  return {
    slos,
    totalChunks,
    isDone: chunkIndex >= totalChunks - 1,
    nextState,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const adminSupabase = getSupabaseAdminClient();
  const queue = new IngestionQueue(adminSupabase);

  // Parse body ONCE at top — chunkIndex and state passed between calls
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

    // ── STEP 1: EXTRACT ──────────────────────────────────────────
    if (job.step === IngestionStep.EXTRACT) {
      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching from storage...' });
      await adminSupabase.from('documents').update({ status: 'processing', document_summary: 'Extracting...' }).eq('id', documentId);

      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error('R2_FAULT: File unreachable. Check R2 CORS — allowed origins must include your Vercel domain.');

      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 18, message: 'Detecting document type...' });

      const extraction = await smartExtractPDF(buffer, doc.name || 'document.pdf');

      if (!extraction.text || extraction.text.length < 300) {
        throw new Error(`Low quality extraction (${extraction.text?.length || 0} chars via ${extraction.method}).`);
      }

      // Detect board and subject from document name + first 2000 chars
      const sampleText = (doc.name || '') + ' ' + extraction.text.substring(0, 2000);
      const detectedBoard = detectBoard(sampleText);
      const detectedSubjectCode = detectSubjectCode(sampleText, detectedBoard);
      const boardInfo = PAKISTAN_BOARDS[detectedBoard];

      await adminSupabase.from('documents').update({
        extracted_text: extraction.text,
        document_summary: `Extracted via ${extraction.method} — ${extraction.text.length} chars | Board:${detectedBoard} | Subject:${detectedSubjectCode}`,
      }).eq('id', documentId);

      await queue.updateProgress(job.id, { step: IngestionStep.LINEARIZE, progress: 30, message: `${extraction.method === 'vision' ? 'Vision' : 'Text'} extraction complete. Board: ${boardInfo?.name || detectedBoard}` });

      return NextResponse.json({
        success: true, done: false, step: 'EXTRACT', nextStep: 'LINEARIZE',
        progress: 30, method: extraction.method, charCount: extraction.text.length,
        board: detectedBoard, subject: boardInfo?.subjectCodes[detectedSubjectCode] || detectedSubjectCode,
        message: `Step 1/3 complete. ${boardInfo?.name || 'Pakistan curriculum'} detected.`,
      });
    }

    // ── STEP 2: LINEARIZE (chunked — Hobby plan safe) ─────────────
    // Route by chunkIndex presence OR job step
    if (job.step === IngestionStep.LINEARIZE || requestBody.chunkIndex !== undefined) {
      const chunkIndex: number = requestBody.chunkIndex ?? 0;

      const { data: current, error: fetchErr } = await adminSupabase
        .from('documents').select('extracted_text, content').eq('id', documentId).single();
      if (fetchErr) throw new Error(`LINEARIZE_FAULT: DB read failed — ${fetchErr.message}`);

      const rawText = current?.extracted_text || '';
      if (rawText.length < 100) {
        throw new Error(`LINEARIZE_FAULT: No extracted text (${rawText.length} chars). Run Step 1 first.`);
      }

      // Restore board/subject state detected in Step 1
      const summaryMeta = current?.extracted_text ? '' : '';
const boardKey = detectBoard((doc.name || '') + rawText.substring(0, 2000));
const subjectCode = detectSubjectCode((doc.name || '') + rawText.substring(0, 2000), boardKey);
      const boardInfo = PAKISTAN_BOARDS[boardKey] || PAKISTAN_BOARDS['SINDH'];
      const subjectName = boardInfo.subjectCodes[subjectCode] || 'Unknown';

      // Restore state passed from previous chunk call
      const state: CurriculumState = requestBody.state || {
        board: boardKey,
        subject: subjectName,
        currentGrade: '',
        currentDomain: '',
        currentDomainName: '',
        currentBenchmark: '',
        detectedSubjectCode: subjectCode,
      };

      const totalChunks = Math.ceil(rawText.length / 17000);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE,
        progress: 35 + Math.round(((chunkIndex + 1) / totalChunks) * 25),
        message: `[${boardKey}] Chunk ${chunkIndex + 1}/${totalChunks}...`,
      });

      const { slos, isDone, nextState } = await processOneChunk(rawText, chunkIndex, state);

      // Validate batch
      const { valid, report } = validateSLOs(slos, boardKey);

      if (report.duplicates.length > 0) {
        console.warn(`[Validation] Chunk ${chunkIndex + 1} duplicates: ${report.duplicates.join(', ')}`);
      }
      if (report.malformed.length > 0) {
        console.warn(`[Validation] Chunk ${chunkIndex + 1} malformed: ${report.malformed.join(', ')}`);
      }

      // Upsert valid SLOs
      if (valid.length > 0) {
        const records = valid.map((s: any) => ({
          document_id: documentId,
          slo_code: s.slo_code,
          slo_full_text: s.slo_full_text || '',
          bloom_level: s.bloom_level || 'Understand',
          subject: s.subject || subjectName,
          grade_level: s.grade || nextState.currentGrade || '',
          cognitive_complexity: s.bloom_level || 'Understand',
          teaching_strategies: [],
          assessment_ideas: [],
          prerequisite_concepts: [],
          common_misconceptions: [],
          keywords: [],
        }));

        // First chunk clears old SLOs for this document
        if (chunkIndex === 0) {
          await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
        }
        await adminSupabase.from('slo_database').insert(records);
      }

      const progressPct = 35 + Math.round(((chunkIndex + 1) / totalChunks) * 25);

      if (!isDone) {
        return NextResponse.json({
          success: true, done: false,
          step: 'LINEARIZE', nextStep: 'LINEARIZE',
          chunkIndex: chunkIndex + 1,
          totalChunks,
          progress: progressPct,
          slosThisChunk: valid.length,
          state: nextState, // Pass state to next chunk call
          message: `[${boardKey}] Chunk ${chunkIndex + 1}/${totalChunks} — ${valid.length} SLOs`,
        });
      }

      // ── ALL CHUNKS DONE ──
      const { count: sloCount } = await adminSupabase
        .from('slo_database')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', documentId);

      const { data: allSlos } = await adminSupabase
        .from('slo_database').select('*').eq('document_id', documentId);

      const markdown = `### ${boardInfo.name} — ${subjectName} Curriculum\n\n<STRUCTURED_INDEX>\n${JSON.stringify(allSlos, null, 2)}\n</STRUCTURED_INDEX>`;

      await adminSupabase.from('documents').update({
        extracted_text: markdown,
        document_summary: `Linearized — ${sloCount || 0} SLOs`,
      }).eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.EMBED,
        progress: 63,
        message: `${sloCount} SLOs extracted from ${boardInfo.name}. Building vectors...`,
      });

      return NextResponse.json({
        success: true, done: false, step: 'LINEARIZE', nextStep: 'EMBED',
        progress: 63, sloCount,
        message: `Step 2/3 complete — ${sloCount} SLOs from ${boardInfo.name}.`,
      });
    }

    // ── STEP 3: EMBED ─────────────────────────────────────────────
    if (job.step === IngestionStep.EMBED) {
      await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 70, message: 'Building vector index...' });

      const { data: finalDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const textToEmbed = finalDoc?.extracted_text || '';
      if (textToEmbed.length < 100) throw new Error('EMBED_FAULT: No text to embed.');

      const result = await indexDocumentForRAG(documentId, textToEmbed, adminSupabase, job.id);
      const chunkCount = result?.count || 0;

      // Chunk–SLO mapping (non-fatal)
      try {
        const { data: chunks } = await adminSupabase.from('document_chunks').select('id, slo_codes').eq('document_id', documentId);
        const { data: slos } = await adminSupabase.from('slo_database').select('id, slo_code').eq('document_id', documentId);
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
        chunkCount, message: `Complete — ${chunkCount} chunks indexed.`,
      });
    }

    return NextResponse.json({ error: 'Unknown step', step: job.step }, { status: 400 });

  } catch (err: any) {
    const msg = err.message || 'Processing failed.';
    console.error(`[Pakistan Engine] Fatal:`, msg);
    try { await queue.markFailed(job.id, msg); } catch (_) {}
    const { data: cur } = await adminSupabase.from('documents').select('status').eq('id', documentId).single();
    if (cur?.status !== 'ready') {
      await adminSupabase.from('documents').update({ status: 'failed', document_summary: msg.substring(0, 500) }).eq('id', documentId);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
