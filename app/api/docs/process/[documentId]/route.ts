// app/api/docs/process/[documentId]/route.ts
// PEDAGOGY MASTER AI — Ingestion Engine v7.4 (DOK + Claude Gaps Fixed)

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

const MODEL_PRIMARY = 'gemini-1.5-flash';
const MODEL_FALLBACK = 'gemini-1.5-flash';

// ── LOOKUP TABLES ─────────────────────────────────────────────────────────────
const ROMAN: Record<string, string> = {
  I: '01', II: '02', III: '03', IV: '04', V: '05', VI: '06',
  VII: '07', VIII: '08', IX: '09', X: '10', XI: '11', XII: '12',
};

const SUBJECTS: Record<string, string> = {
  B: 'Biology', C: 'Chemistry', P: 'Physics', M: 'Mathematics',
  E: 'English', U: 'Urdu', S: 'General Science', CS: 'Computer Science',
  GEO: 'Geography', ECO: 'Economics', PST: 'Pakistan Studies',
};

const BOARD_NAMES: Record<string, string> = {
  SINDH: 'Sindh Textbook Board',
  PUNJAB: 'Punjab Curriculum & Textbook Board',
  FBISE: 'Federal Board (FBISE)',
  KPK: 'KPK Textbook Board',
  BALOCHISTAN: 'Balochistan Curriculum & Textbook Board',
  AJK: 'AJK Textbook Board',
};

// ── DETECTION FUNCTIONS ───────────────────────────────────────────────────────
function detectBoard(t: string): string {
  t = t.toLowerCase();
  if (t.includes('sindh') || t.includes('jamshoro')) return 'SINDH';
  if (t.includes('punjab') || t.includes('pctb')) return 'PUNJAB';
  if (t.includes('federal') || t.includes('fbise')) return 'FBISE';
  if (t.includes('kpk') || t.includes('khyber')) return 'KPK';
  if (t.includes('balochistan')) return 'BALOCHISTAN';
  if (t.includes('ajk')) return 'AJK';
  return 'SINDH';
}

function detectSubject(t: string): string {
  t = t.toLowerCase();
  if (t.includes('biology')) return 'B';
  if (t.includes('chemistry')) return 'C';
  if (t.includes('physics')) return 'P';
  if (t.includes('mathematics') || /\bmath\b/.test(t)) return 'M';
  if (t.includes('computer science')) return 'CS';
  if (t.includes('general science')) return 'S';
  if (t.includes('english')) return 'E';
  if (t.includes('urdu')) return 'U';
  return 'B';
}

// ── SLO CODE NORMALIZER ───────────────────────────────────────────────────────
function normalizeCode(raw: any): string | null {
  if (!raw || raw === 'null') return null;
  let s = String(raw).toUpperCase()
    .replace(/^\[?(?:5L0|SL[O0]|LO|SW)\s*[:\s]*/i, '')
    .replace(/[\[\]():]/g, '')
    .replace(/[.\s]/g, '')
    .trim();

  const gradeRange = s.match(/^([A-Z]{1,4})-?(\d{2})-(\d{2})-?([A-Z])-?(\d{1,3})$/);
  if (gradeRange) return `${gradeRange[1]}${gradeRange[2]}${gradeRange[4]}${gradeRange[5].padStart(2, '0')}`;

  s = s.replace(/-/g, '');

  s = s.replace(/([A-Z]{1,4})0[LlIi]([A-Z])/, '$101$2');
  s = s.replace(/0[LlIi]$/i, '01');
  s = s.replace(/[lI]$/i, '1');
  s = s.replace(/([A-Z])O(\d)/, '$10$2');
  s = s.replace(/(\d)O([A-Z\d])/, '$10$2');

  const romMatch = s.match(/^([A-Z]{1,4})(XII|XI|IX|X|VIII|VII|VI|V|IV|III|II)([A-Z])(\d{1,3})$/);
  if (romMatch) {
    return `${romMatch[1]}${ROMAN[romMatch[2]] ?? romMatch[2]}${romMatch[3]}${romMatch[4].padStart(2, '0')}`;
  }

  const numMatch = s.match(/^([A-Z]{1,4})(\d{1,2})([A-Z])(\d{1,3})$/);
  if (numMatch) {
    const sloNum = numMatch[4].startsWith('00') ? numMatch[4].slice(-2) : numMatch[4].padStart(2, '0');
    return `${numMatch[1]}${numMatch[2].padStart(2, '0')}${numMatch[3]}${sloNum}`;
  }
  return null;
}

// ── HELPER FUNCTIONS ──────────────────────────────────────────────────────────
function linearizeSloText(text: string): string {
  return text
    .replace(/Page \d+ of \d+/gi, '')
    .replace(/© .*?Board/gi, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

function extractRawSloBlocks(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split('\n');
  let current = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[A-Z]\d{2}[A-Z]\d/.test(trimmed) || trimmed.includes('SLO') || trimmed.includes('Student Learning Outcome')) {
      if (current) blocks.push(current.trim());
      current = line;
    } else if (current) {
      current += '\n' + line;
    }
  }
  if (current) blocks.push(current.trim());
  return blocks.length > 0 ? blocks : [text];
}

function safeJson(raw: any): any {
  if (typeof raw === 'string') {
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { slos: [] };
    }
  }
  return raw || { slos: [] };
}

function processSlos(raw: any[], boardKey: string, subjectCode: string): any[] {
  return raw.map((slo: any) => ({
    slo_code: normalizeCode(slo.slo_code || slo.code) || 'UNKNOWN',
    slo_full_text: slo.description || slo.text || slo.slo_full_text || '',
    bloom_level: slo.bloom || slo.bloom_level || 'Remember',
    dok_level: slo.dok || slo.dok_level || 'DOK 2',        // ← Added DOK
    domain: slo.domain || 'Core',
    board: boardKey,
    subject: subjectCode,
  }));
}

function buildLedger(slos: any[], boardKey: string, subjectCode: string): string {
  let ledger = `# ${BOARD_NAMES[boardKey] || boardKey} - ${subjectCode} SLO Ledger\n\n`;
  
  const sorted = [...slos].sort((a, b) => {
    const numA = parseInt(a.slo_code.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.slo_code.replace(/\D/g, '')) || 0;
    return numA - numB;
  });

  sorted.forEach(s => {
    ledger += `**${s.slo_code}** — ${s.slo_full_text}\n`;
    ledger += `Bloom: ${s.bloom_level} | DOK: ${s.dok_level}\n\n`;
  });
  return ledger;
}

function makePrompt(chunk: string, subject: string, subjectCode: string, board: string, chunkN: number): string {
  return `You are an expert Pakistani curriculum analyst.
Extract ALL Student Learning Outcomes (SLOs) from the text below.

BOARD: ${board}
SUBJECT: ${subject} (${subjectCode})

For each SLO, return valid JSON array with these fields:
- slo_code (e.g. B09A01)
- description (full SLO text)
- bloom (Remember, Understand, Apply, Analyze, Evaluate, Create)
- dok (DOK 1, DOK 2, DOK 3, or DOK 4)

Return ONLY valid JSON like:
{
  "slos": [
    {
      "slo_code": "B09A01",
      "description": "full text here",
      "bloom": "Understand",
      "dok": "DOK 2"
    }
  ]
}

TEXT CHUNK ${chunkN}:
${chunk}`;
}

async function callAIOrchestrator(apiKey: string, text: string, subject: string, subjectCode: string, board: string, chunkN: number) {
  const genAI = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY! });
  const prompt = makePrompt(text, subject, subjectCode, board, chunkN);

  try {
    const result = await genAI.models.generateContent({
      model: MODEL_PRIMARY,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    const parsed = safeJson(result.text);
    return parsed.slos || [];
  } catch (e) {
    console.warn("Primary model failed, using fallback", e);
    const fallbackResult = await genAI.models.generateContent({
      model: MODEL_FALLBACK,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    const parsed = safeJson(fallbackResult.text);
    return parsed.slos || [];
  }
}

// ── MAIN ROUTE ───────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const supabase = getSupabaseAdminClient();
  const queue = new IngestionQueue(supabase);
  let job: any = null;

  try {
    // Auth Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Job Management
    job = await queue.getJobStatus(documentId).catch(() => null);

    if (!job) {
      const id = await queue.enqueue(documentId);
      job = { id, step: IngestionStep.EXTRACT };
    } else if (job.status === 'complete' || job.step === IngestionStep.COMPLETE) {
      return NextResponse.json({ success: true, done: true, progress: 100 });
    } else if (job.status === 'pending' || job.status === 'processing') {
      await supabase
        .from('ingestion_jobs')
        .update({ status: 'processing', message: 'Resuming ingestion...' })
        .eq('id', job.id);
      if (!job.step) job.step = IngestionStep.EXTRACT;
    }

    const apiKey = process.env.API_KEY || '';

    // STAGE 1: EXTRACT
    if (job.step === IngestionStep.EXTRACT) {
      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching PDF...' });

      const { data: docData } = await supabase.from('documents').select('*').eq('id', documentId).single();
      if (!docData) throw new Error('Document not found');

      let text = docData.extracted_text || '';

      if (!text || text.length < 200) {
        const r2Path = docData.file_path;
        if (!r2Path) throw new Error('No file_path in R2');

        const buffer = await getObjectBuffer(r2Path);
        if (!buffer) throw new Error('R2 file unreachable');

        const result = await pdf(buffer);
        text = result.text?.trim() || '';
      }

      if (text.length < 200) throw new Error(`PDF text too short: ${text.length} chars`);

      const sample = (docData.name || '') + ' ' + text.substring(0, 2000);
      const board = detectBoard(sample);
      const subject = detectSubject(sample);

      await supabase.from('documents').update({
        extracted_text: text,
        document_summary: `raw|board:${board}|subject:${subject}|len:${text.length}`,
        status: 'processing',
      }).eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE,
        progress: 25,
        message: 'Linearizing and extracting SLOs...',
      });
    }

    // STAGE 2: LINEARIZE + SLO EXTRACTION
    if (job.step === IngestionStep.LINEARIZE) {
      // Clear previous SLOs for this document
      await supabase.from('slo_database').delete().eq('document_id', documentId);

      const { data: docData } = await supabase.from('documents').select('extracted_text, name').eq('id', documentId).single();
      const rawText = docData?.extracted_text || '';
      const board = detectBoard(rawText);
      const subjectCode = detectSubject(rawText);

      const slos = await extractSlos(rawText, board, subjectCode, apiKey, documentId, supabase, job.id, queue);

      const ledger = buildLedger(slos, board, subjectCode);

      if (slos.length > 0) {
        const sloInserts = slos.map(s => ({
          document_id: documentId,
          slo_code: s.slo_code,
          slo_full_text: s.slo_full_text,
          bloom_level: s.bloom_level,
          dok_level: s.dok_level,           // ← Added DOK
          domain: s.domain || 'Core',
        }));
        await supabase.from('slo_database').insert(sloInserts);
      }

      await supabase.from('documents').update({
        document_summary: ledger,
        status: 'processing',
      }).eq('id', documentId);

      await queue.updateProgress(job.id, { 
        step: IngestionStep.EMBED, 
        progress: 75, 
        message: 'Building vector index...' 
      });
    }

    // STAGE 4: EMBED
    if (job.step === IngestionStep.EMBED) {
      const { data: fin } = await supabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const txt = fin?.extracted_text || '';

      if (txt.length >= 100) {
        await indexDocumentForRAG(documentId, txt, supabase, job.id);
      }

      await queue.markComplete(job.id);

      await supabase.from('documents').update({
        status: 'ready',
        rag_indexed: true,
        updated_at: new Date().toISOString(),
      }).eq('id', documentId);
    }

    return NextResponse.json({ success: true, status: 'ready', progress: 100 });

  } catch (err: any) {
    console.error(`[Ingestion Failure] doc=${documentId}:`, err.message);

    if (job?.id) {
      await queue.markFailed(job.id, err.message).catch(() => {});
    }

    try {
      await supabase.from('documents')
        .update({ status: 'failed', document_summary: `error: ${err.message}` })
        .eq('id', documentId);
    } catch (updateErr) {
      console.error("Failed to update document status:", updateErr);
    }

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── extractSlos Function (with DOK support) ─────────────────────────────────
async function extractSlos(
  text: string,
  boardKey: string,
  subjectCode: string,
  apiKey: string,
  documentId: string,
  supabase: any,
  jobId: string,
  queue: IngestionQueue
): Promise<any[]> {
  const linearized = linearizeSloText(text);
  const rawBlocks = extractRawSloBlocks(linearized);
  let allSlos: any[] = [];

  for (let i = 0; i < rawBlocks.length; i++) {
    await queue.updateProgress(jobId, {
      step: IngestionStep.LINEARIZE,
      progress: 30 + Math.floor((i / rawBlocks.length) * 45),
      message: `Extracting SLOs (${i + 1}/${rawBlocks.length})`
    });

    const chunkSlos = await callAIOrchestrator(apiKey, rawBlocks[i], subjectCode, subjectCode, boardKey, i + 1);
    allSlos = allSlos.concat(processSlos(chunkSlos, boardKey, subjectCode));
  }

  // Global deduplication
  const seen = new Set<string>();
  return allSlos.filter(slo => {
    if (seen.has(slo.slo_code)) return false;
    seen.add(slo.slo_code);
    return true;
  });
}
