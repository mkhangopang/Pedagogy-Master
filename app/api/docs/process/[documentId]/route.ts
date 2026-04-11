// app/api/docs/process/[documentId]/route.ts
// PEDAGOGY MASTER AI — Ingestion Engine v6.6 (Fixed Build + Handshake)

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep } from '../../../../../types';
import { IngestionQueue } from '../../../../../lib/jobs/ingestion-queue';
import pdf from 'pdf-parse';
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from 'openai';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ── CONFIG ────────────────────────────────────────────────────────────────────
const MODEL_PRIMARY = 'gemini-2.0-flash';
const MODEL_FALLBACK = 'gemini-1.5-flash';

const CHUNK_SIZE = 10000;
const OVERLAP = 2500;
const MIN_ADVANCE = 5000;

// ── LOOKUP TABLES ─────────────────────────────────────────────────────────────
const ROMAN: Record<string, string> = {
  I: '01', II: '02', III: '03', IV: '04', V: '05', VI: '06',
  VII: '07', VIII: '08', IX: '09', X: '10', XI: '11', XII: '12',
};

const PRIMARY_SUBJECTS = new Set(['M', 'S', 'E', 'U']);

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

function normalizeGrade(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw !== 'string') raw = String(raw);
  const t = raw.trim().toUpperCase();
  if (ROMAN[t]) return ROMAN[t];
  const n = parseInt(t, 10);
  return (!isNaN(n) && n >= 1 && n <= 12) ? n.toString().padStart(2, '0') : null;
}

function normalizeCode(raw: any): string | null {
  if (!raw || raw === 'null') return null;
  if (typeof raw !== 'string') raw = String(raw);

  let s = raw.toUpperCase()
    .replace(/^\[?(?:5L0|SL[O0]|LO|SW)\s*[:\s]*/i, '')
    .replace(/[\[\]():]/g, '')
    .replace(/[.\s]/g, '')
    .trim();

  const gradeRange = s.match(/^([A-Z]{1,4})-?(\d{2})-(\d{2})-?([A-Z])-?(\d{1,3})$/);
  if (gradeRange) {
    return `${gradeRange[1]}${gradeRange[2]}${gradeRange[4]}${gradeRange[5].padStart(2, '0')}`;
  }

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

// ── IMPORTANT: Paste ALL your other helper functions here ───────────────────
// linearizeSloText, scanDomains, safeJson, dedupe, processSlos, extractRawSloBlocks,
// makePrompt, callAIOrchestrator, extractSlos, buildLedger
// (Copy them from your previous working version)

// For now, to make the build pass, I'm including minimal placeholders.
// Replace the comment below with your full helper functions.

function linearizeSloText(text: string): string { return text; } // ← REPLACE WITH YOUR REAL FUNCTION
function scanDomains(text: string): Record<string, string> { return {}; }
function safeJson(raw: any): any { return { slos: [] }; }
function processSlos(raw: any[], boardKey: string, subjectCode: string, domainMap: Record<string, string>): any[] { return []; }
function extractRawSloBlocks(text: string): string[] { return []; }
function makePrompt(chunk: string, subject: string, subjectCode: string, board: string, chunkN: number, isDeep = false): string { return ''; }
async function callAIOrchestrator(apiKey: string, text: string, schema: any, subject: string, subjectCode: string, board: string, chunkN: number, isDeep = false, retries = 2): Promise<any[]> { return []; }
async function extractSlos(text: string, boardKey: string, subjectCode: string, domainMap: Record<string, string>, apiKey: string, documentId: string, supabase: any, jobId: string, queue: IngestionQueue): Promise<any[]> { return []; }
function buildLedger(slos: any[], boardKey: string, subjectCode: string): string { return ''; }

// ── ROUTE HANDLER ─────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const supabase = getSupabaseAdminClient();
  const queue = new IngestionQueue(supabase);

  let job: any = null;   // ← Fixed: Declare job outside try/catch

  console.log(`[Ingestion] POST started for document: ${documentId}`);

  try {
    // Early Auth Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'SYNC HANDSHAKE FAULT', details: 'Authorization header missing' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[Ingestion] Auth failed:', authError?.message);
      return NextResponse.json({ error: 'SYNC HANDSHAKE FAULT', details: 'Invalid session' }, { status: 401 });
    }

    console.log(`[Ingestion] Auth OK for user: ${user.id}`);

    job = await queue.getJobStatus(documentId).catch(() => null);

    if (!job) {
      const id = await queue.enqueue(documentId);
      job = { id, step: IngestionStep.EXTRACT };
    } else if (job.status === 'complete' || job.step === IngestionStep.COMPLETE) {
      return NextResponse.json({ success: true, done: true, step: 'COMPLETE', progress: 100 });
    } else if (job.status === 'processing' && job.updated_at) {
      const lastUpdate = new Date(job.updated_at).getTime();
      if (Date.now() - lastUpdate < 300000) {
        return NextResponse.json({ success: true, message: 'Already processing' });
      }
      await supabase.from('ingestion_jobs').update({ status: 'pending' }).eq('id', job.id);
    } else if (job.status === 'pending') {
      await supabase.from('ingestion_jobs').update({ status: 'processing', message: null }).eq('id', job.id);
      if (!job.step) job.step = IngestionStep.EXTRACT;
    }

    // STAGE 1 — EXTRACT
    if (job.step === IngestionStep.EXTRACT) {
      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching PDF...' });

      const { data: docData } = await supabase.from('documents').select('*').eq('id', documentId).single();
      if (!docData) throw new Error('VAULT_ERROR: Document not found');

      let text = docData.extracted_text || '';

      if (!text || text.length < 200) {
        const r2Path = docData.file_path;
        if (!r2Path) throw new Error('R2_FAULT: No file_path');

        const buffer = await getObjectBuffer(r2Path);
        if (!buffer) throw new Error('R2_FAULT: File unreachable');

        const result = await pdf(buffer);
        text = result.text?.trim() || '';
      }

      if (text.length < 200) throw new Error(`PDF_TOO_SHORT: ${text.length} chars`);

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
        message: 'Extracting SLOs...',
      });
      job = await queue.getJobStatus(documentId);
    }

    // STAGE 2 — LINEARIZE
    if (job.step === IngestionStep.LINEARIZE) {
      // TODO: Paste your full original Stage 2 code here
      console.log('[Stage 2] LINEARIZE - Full logic needed');
      await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 75, message: 'Building RAG index...' });
      job = await queue.getJobStatus(documentId);
    }

    // STAGE 4 — EMBED
    if (job.step === IngestionStep.EMBED) {
      const { data: fin } = await supabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const txt = fin?.extracted_text || '';
      const isLedger = txt.startsWith('# ') || txt.startsWith('Board:') || txt.startsWith('{');

      if (txt.length >= 100) {
        await indexDocumentForRAG(documentId, txt, supabase, job.id);
      }

      await queue.markComplete(job.id);

      await supabase.from('documents').update({
        status: 'ready',
        rag_indexed: true,
        updated_at: new Date().toISOString(),
        document_summary: isLedger 
          ? txt.split('\n').slice(0, 6).join(' | ').substring(0, 500) 
          : `indexed|${txt.length} chars`,
      }).eq('id', documentId);
    }

    console.log(`[Ingestion] SUCCESS doc=${documentId}`);
    return NextResponse.json({ success: true, status: 'ready' });

  } catch (err: any) {
    const msg = String(err.message || err).substring(0, 500);
    console.error(`[Ingestion] FAILURE doc=${documentId}:`, msg);

    try { 
      if (job?.id) await queue.markFailed(job.id, msg); 
    } catch (_) {}
    
    try {
      await supabase.from('documents')
        .update({ status: 'failed', document_summary: `error: ${msg}` })
        .eq('id', documentId);
    } catch (_) {}

    return NextResponse.json({ 
      error: 'SYNC HANDSHAKE FAULT', 
      details: msg 
    }, { status: 500 });
  }
}
