// app/api/docs/process/[documentId]/route.ts
// PEDAGOGY MASTER AI — Ingestion Engine v8.0
// Multi-provider orchestrator: Groq → Cerebras → SambaNova → Mistral → DeepSeek → OpenRouter → Gemini (last resort)

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep } from '../../../../../types';
import { IngestionQueue } from '../../../../../lib/jobs/ingestion-queue';
import pdf from 'pdf-parse';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ── MODEL CONFIG ──────────────────────────────────────────────────────────────
const GEMINI_PRIMARY  = 'gemini-2.5-flash';
const GEMINI_FALLBACK = 'gemini-2.0-flash';

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

// ── DETECTION ─────────────────────────────────────────────────────────────────
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

// ── BLOOM NORMALIZER ──────────────────────────────────────────────────────────
function normalizeBloom(raw: string | undefined): string {
  if (!raw) return 'Understand';
  const v = raw.toLowerCase().trim();
  if (v.includes('remember') || v.includes('knowledge') || v.includes('recall')) return 'Remember';
  if (v.includes('understand') || v.includes('comprehend')) return 'Understand';
  if (v.includes('apply') || v.includes('application')) return 'Apply';
  if (v.includes('analyz') || v.includes('analys')) return 'Analyze';
  if (v.includes('evaluat')) return 'Evaluate';
  if (v.includes('creat') || v.includes('synth')) return 'Create';
  return 'Understand';
}

// ── DOK NORMALIZER ────────────────────────────────────────────────────────────
function normalizeDok(raw: string | number | undefined): number {
  if (!raw) return 2;
  const s = String(raw);
  const n = parseInt(s.replace(/\D/g, ''), 10);
  if (n >= 1 && n <= 4) return n;
  return 2;
}

// ── TEXT HELPERS ──────────────────────────────────────────────────────────────
function linearizeSloText(text: string): string {
  return text
    .replace(/Page \d+ of \d+/gi, '')
    .replace(/© .*?Board/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractRawSloBlocks(text: string): string[] {
  // Split into chunks of ~3000 chars at paragraph boundaries
  const CHUNK = 3000;
  const OVERLAP = 300;
  if (text.length <= CHUNK) return [text];

  const blocks: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    let end = Math.min(offset + CHUNK, text.length);
    // Try to break at a newline
    if (end < text.length) {
      const zone = text.substring(end - 200, end);
      const nl = zone.lastIndexOf('\n');
      if (nl !== -1) end = end - 200 + nl + 1;
    }
    blocks.push(text.substring(offset, end));
    offset = Math.max(offset + 1, end - OVERLAP);
  }
  return blocks;
}

function safeJson(raw: any): { slos: any[] } {
  if (!raw) return { slos: [] };
  const s = typeof raw === 'string' ? raw : String(raw);
  const cleaned = s
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/```\s*$/m, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return { slos: parsed };
    if (parsed?.slos && Array.isArray(parsed.slos)) return { slos: parsed.slos };
    return { slos: [] };
  } catch {
    // Try to extract JSON object from messy text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const p2 = JSON.parse(match[0]);
        return { slos: p2.slos || [] };
      } catch { /* */ }
    }
    return { slos: [] };
  }
}

function processSlos(raw: any[], boardKey: string, subjectCode: string): any[] {
  const out: any[] = [];
  for (const slo of raw) {
    const text = (slo.description || slo.text || slo.slo_full_text || '').trim();
    if (!text) continue;
    out.push({
      slo_code:   normalizeCode(slo.slo_code || slo.code),
      slo_full_text: text,
      bloom_level: normalizeBloom(slo.bloom || slo.bloom_level),
      dok_level:   normalizeDok(slo.dok || slo.dok_level),
      domain:      (slo.domain || '').trim() || null,
      domain_name: (slo.domain_name || '').trim() || null,
      grade_level: (slo.grade || slo.grade_level || '').trim() || null,
      board:       boardKey,
      subject:     SUBJECTS[subjectCode] || subjectCode,
    });
  }
  return out;
}

// ── PROMPT ────────────────────────────────────────────────────────────────────
function makePrompt(chunk: string, subject: string, subjectCode: string, board: string, chunkN: number): string {
  return `You are an expert Pakistani curriculum analyst.
Extract ALL Student Learning Outcomes (SLOs) from the text below.

BOARD: ${board} | SUBJECT: ${subject} (${subjectCode}) | CHUNK: ${chunkN}

For each SLO return a JSON object with:
- slo_code: string like B09A01 (subject+grade+domain+number)
- description: full SLO text (preserve completely)
- bloom: one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- dok: one of: DOK 1, DOK 2, DOK 3, DOK 4
- domain: single uppercase letter (A, B, C...)
- domain_name: domain full name if visible
- grade_level: 2-digit string like "09", "10", "11"

Return ONLY valid JSON:
{"slos":[{"slo_code":"B09A01","description":"...","bloom":"Understand","dok":"DOK 2","domain":"A","domain_name":"Nature of Science","grade_level":"09"}]}

If no SLOs found return: {"slos":[]}

TEXT:
${chunk}`;
}

// ── MULTI-PROVIDER AI ORCHESTRATOR ────────────────────────────────────────────
// Priority: free/fast providers first, Gemini LAST (quota saver)
async function callAIOrchestrator(
  geminiApiKey: string,
  text: string,
  subject: string,
  subjectCode: string,
  board: string,
  chunkN: number
): Promise<any[]> {
  const prompt = makePrompt(text, subject, subjectCode, board, chunkN);

  // ── Tier 1: Free/fast OpenAI-compatible providers ─────────────────────────
  const providers = [
    {
      name:  'Groq',
      key:   process.env.GROQ_API_KEY,
      url:   'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
    },
    {
      name:  'Cerebras',
      key:   process.env.CEREBRAS_API_KEY,
      url:   'https://api.cerebras.ai/v1',
      model: 'llama-3.3-70b',
    },
    {
      name:  'SambaNova',
      key:   process.env.SAMBANOVA_API_KEY,
      url:   'https://api.sambanova.ai/v1',
      model: 'Meta-Llama-3.1-70B-Instruct',
    },
    {
      name:  'Mistral',
      key:   process.env.API_MISTRAL,
      url:   'https://api.mistral.ai/v1',
      model: 'mistral-small-latest',
    },
    {
      name:  'DeepSeek',
      key:   process.env.DEEPSEEK_API_KEY,
      url:   'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    },
    {
      name:  'OpenRouter',
      key:   process.env.OPENROUTER_API_KEY,
      url:   'https://openrouter.ai/api/v1',
      model: 'meta-llama/llama-3.1-8b-instruct:free',
    },
    {
      name:  'AI Gateway',
      key:   process.env.AI_GATEWAY_API_KEY,
      url:   process.env.AI_GATEWAY_URL || 'https://api.openai.com/v1',
      model: process.env.AI_GATEWAY_MODEL || 'gpt-4o-mini',
    },
  ].filter(p => p.key);

  for (const provider of providers) {
    try {
      console.log(`[Orchestrator] Trying ${provider.name} (${provider.model})...`);
      const client = new OpenAI({
        apiKey:  provider.key!,
        baseURL: provider.url,
        timeout: 25000,
      });
      const completion = await client.chat.completions.create({
        model:    provider.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 4096,
      });
      const raw = completion.choices[0]?.message?.content || '';
      const parsed = safeJson(raw);
      if (parsed.slos.length > 0) {
        console.log(`[Orchestrator] ${provider.name} success: ${parsed.slos.length} SLOs`);
        return parsed.slos;
      }
      console.warn(`[Orchestrator] ${provider.name} returned 0 SLOs, trying next...`);
    } catch (err: any) {
      const isQuota = /429|quota|rate.?limit|exceeded/i.test(err.message || '');
      console.warn(`[Orchestrator] ${provider.name} failed (${isQuota ? 'quota' : 'error'}): ${err.message?.substring(0, 80)}`);
      // Continue to next provider
    }
  }

  // ── Tier 2: Gemini — LAST RESORT only ────────────────────────────────────
  if (!geminiApiKey) {
    console.error('[Orchestrator] No Gemini API key and all providers failed');
    return [];
  }

  const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

  for (const modelName of [GEMINI_PRIMARY, GEMINI_FALLBACK]) {
    try {
      console.log(`[Orchestrator] Gemini last resort: ${modelName}`);
      const result = await genAI.models.generateContent({
        model:    modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          temperature:      0.1,
          maxOutputTokens:  4096,
        },
      });
      const parsed = safeJson(result.text);
      if (parsed.slos.length > 0) {
        console.log(`[Orchestrator] Gemini ${modelName} success: ${parsed.slos.length} SLOs`);
        return parsed.slos;
      }
    } catch (err: any) {
      const isQuota = /429|quota|RESOURCE_EXHAUSTED/i.test(err.message || '');
      console.warn(`[Orchestrator] Gemini ${modelName} failed (${isQuota ? 'QUOTA' : 'error'}): ${err.message?.substring(0, 120)}`);
      if (isQuota) {
        console.warn('[Orchestrator] Gemini quota hit — skipping remaining Gemini models');
        break; // Don't try fallback if quota is the issue
      }
    }
  }

  console.error('[Orchestrator] ALL providers exhausted for this chunk');
  return [];
}

// ── BUILD LEDGER ──────────────────────────────────────────────────────────────
function buildLedger(slos: any[], boardKey: string, subjectCode: string): string {
  const boardName = BOARD_NAMES[boardKey] || boardKey;
  const subjectName = SUBJECTS[subjectCode] || subjectCode;

  const sorted = [...slos].sort((a, b) => {
    const gA = parseInt(a.grade_level || '99', 10);
    const gB = parseInt(b.grade_level || '99', 10);
    if (gA !== gB) return gA - gB;
    const dA = (a.domain || 'Z').toUpperCase();
    const dB = (b.domain || 'Z').toUpperCase();
    if (dA !== dB) return dA.localeCompare(dB);
    const nA = parseInt((a.slo_code || '').replace(/\D/g, '').slice(-2) || '0', 10);
    const nB = parseInt((b.slo_code || '').replace(/\D/g, '').slice(-2) || '0', 10);
    return nA - nB;
  });

  let md = `# ${boardName} — ${subjectName}\n\n`;

  // Grade → Domain → SLO hierarchy
  const grades = [...new Set(sorted.map(s => s.grade_level || 'Unknown'))];
  for (const grade of grades) {
    md += `## Grade ${grade}\n\n`;
    const gradeSlos = sorted.filter(s => (s.grade_level || 'Unknown') === grade);
    const domains = [...new Set(gradeSlos.map(s => s.domain || '?'))];
    for (const domain of domains) {
      const domainSlos = gradeSlos.filter(s => (s.domain || '?') === domain);
      const dname = domainSlos[0]?.domain_name || 'Domain';
      md += `### Domain ${domain}: ${dname}\n\n`;
      for (const s of domainSlos) {
        md += `- **${s.slo_code || 'NO_CODE'}** — ${s.slo_full_text}\n`;
        md += `  *(Bloom: ${s.bloom_level} | DOK: ${s.dok_level})*\n`;
      }
      md += '\n';
    }
  }

  // Structured index for tools
  md += `\n<STRUCTURED_INDEX>\n${JSON.stringify(sorted, null, 2)}\n</STRUCTURED_INDEX>`;
  return md;
}

// ── MAIN EXTRACT ──────────────────────────────────────────────────────────────
async function extractSlos(
  text: string,
  boardKey: string,
  subjectCode: string,
  geminiKey: string,
  documentId: string,
  supabase: any,
  jobId: string,
  queue: IngestionQueue
): Promise<any[]> {
  const linearized = linearizeSloText(text);
  const blocks = extractRawSloBlocks(linearized);
  const subjectName = SUBJECTS[subjectCode] || subjectCode;
  const seenFp = new Set<string>();
  const allSlos: any[] = [];

  console.log(`[Extract] ${blocks.length} chunks for doc ${documentId}`);

  for (let i = 0; i < blocks.length; i++) {
    await queue.updateProgress(jobId, {
      step: IngestionStep.LINEARIZE,
      progress: 30 + Math.floor((i / blocks.length) * 42),
      message: `Extracting SLOs (${i + 1}/${blocks.length})...`,
    });

    const chunkSlos = await callAIOrchestrator(
      geminiKey, blocks[i], subjectName, subjectCode, boardKey, i + 1
    );

    for (const raw of chunkSlos) {
      const processed = processSlos([raw], boardKey, subjectCode)[0];
      if (!processed?.slo_full_text) continue;
      const fp = createHash('md5')
        .update(`${processed.slo_code ?? 'null'}|${processed.slo_full_text}`)
        .digest('hex');
      if (seenFp.has(fp)) continue;
      seenFp.add(fp);
      allSlos.push(processed);
    }
  }

  console.log(`[Extract] Total unique SLOs: ${allSlos.length}`);
  return allSlos;
}

// ── ROUTE HANDLER ─────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const supabase = getSupabaseAdminClient();
  const queue = new IngestionQueue(supabase);
  let job: any = null;

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // ── Job state ────────────────────────────────────────────────────────────
    job = await queue.getJobStatus(documentId).catch(() => null);

    if (!job) {
      const id = await queue.enqueue(documentId);
      job = { id, step: IngestionStep.EXTRACT };
    } else if (job.status === 'complete' || job.step === IngestionStep.COMPLETE) {
      return NextResponse.json({ success: true, done: true, progress: 100 });
    } else if (job.status === 'pending' || job.status === 'processing') {
      const age = Date.now() - new Date(job.updated_at || 0).getTime();
      if (job.status === 'processing' && age < 90000) {
        // Still actively processing — don't restart
        return NextResponse.json({ success: true, message: 'Processing in progress' });
      }
      await supabase.from('ingestion_jobs')
        .update({ status: 'processing', message: 'Resuming...' })
        .eq('id', job.id);
      job.step = job.step || IngestionStep.EXTRACT;
    } else if (job.status === 'failed') {
      // Reset failed jobs so they can retry
      await supabase.from('ingestion_jobs')
        .update({ status: 'processing', step: 'EXTRACT', message: 'Retrying...' })
        .eq('id', job.id);
      job.step = IngestionStep.EXTRACT;
    }

    // API key for Gemini (last resort only)
    const geminiKey =
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      process.env.API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      '';

    // ════════════════════════════════════════════════════════
    // STAGE 1: EXTRACT — PDF → raw text
    // ════════════════════════════════════════════════════════
    if (job.step === IngestionStep.EXTRACT) {
      console.log('[Stage 1] EXTRACT start');
      await queue.updateProgress(job.id, {
        step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching PDF...',
      });

      const { data: docData } = await supabase
        .from('documents').select('*').eq('id', documentId).single();
      if (!docData) throw new Error('Document not found in database');

      let text = docData.extracted_text || '';

      if (!text || text.length < 200) {
        const r2Path = docData.r2_key || docData.file_path;
        if (!r2Path) throw new Error('No file path on document record');
        const buffer = await Promise.race([
          getObjectBuffer(r2Path),
          new Promise<null>((_, rej) => setTimeout(() => rej(new Error('R2 fetch timeout')), 25000)),
        ]);
        if (!buffer) throw new Error('R2 file unreachable');
        const result = await Promise.race([
          pdf(buffer as Buffer),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('PDF parse timeout')), 20000)),
        ]);
        text = (result as any).text?.trim() || '';
        console.log(`[Stage 1] PDF parsed: ${text.length} chars`);
      }

      if (text.length < 200) throw new Error(`PDF extracted text too short: ${text.length} chars`);

      const sample = (docData.name || '') + ' ' + text.substring(0, 2000);
      const board = detectBoard(sample);
      const subject = detectSubject(sample);

      await supabase.from('documents').update({
        extracted_text: text,
        document_summary: `raw|board:${board}|subject:${subject}|len:${text.length}`,
        status: 'processing',
      }).eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE, progress: 25, message: 'Extracting SLOs...',
      });
      // Reload job so step check below works
      job = await queue.getJobStatus(documentId);
    }

    // ════════════════════════════════════════════════════════
    // STAGE 2: LINEARIZE — AI extraction → slo_database
    // ════════════════════════════════════════════════════════
    if (job.step === IngestionStep.LINEARIZE) {
      console.log('[Stage 2] LINEARIZE start');

      const { data: docData } = await supabase
        .from('documents')
        .select('extracted_text, document_summary, name')
        .eq('id', documentId)
        .single();

      const rawText = docData?.extracted_text || '';
      if (!rawText || rawText.length < 200) {
        throw new Error('No extracted text found for Stage 2');
      }

      const meta    = docData?.document_summary || '';
      const board   = meta.match(/board:(\w+)/)?.[1] || detectBoard(rawText);
      const subject = meta.match(/subject:([A-Z]+)/)?.[1] || detectSubject(rawText);

      // Clear old SLOs for this document
      await supabase.from('slo_database').delete().eq('document_id', documentId);

      const slos = await extractSlos(rawText, board, subject, geminiKey, documentId, supabase, job.id, queue);

      if (slos.length === 0) {
        console.warn('[Stage 2] No SLOs extracted — marking document failed');
        await supabase.from('documents').update({
          status: 'failed',
          document_summary: `error: 0 SLOs extracted from ${rawText.length} chars`,
        }).eq('id', documentId);
        await queue.markFailed(job.id, '0 SLOs extracted');
        return NextResponse.json({ error: '0 SLOs extracted' }, { status: 422 });
      }

      // Insert into slo_database in batches
      const BATCH = 50;
      for (let i = 0; i < slos.length; i += BATCH) {
        const batch = slos.slice(i, i + BATCH).map(s => ({
          document_id:   documentId,
          slo_code:      s.slo_code,
          slo_full_text: s.slo_full_text,
          bloom_level:   s.bloom_level,
          dok_level:     s.dok_level,
          domain:        s.domain,
          domain_name:   s.domain_name,
          grade_level:   s.grade_level,
          subject:       s.subject,
          board:         s.board,
          extraction_confidence: s.slo_code ? 0.92 : 0.5,
          is_truncated:  false,
        }));

        // Coded SLOs → upsert (idempotent), codeless → insert
        const coded    = batch.filter(r => r.slo_code && r.slo_code !== 'UNKNOWN');
        const codeless = batch.filter(r => !r.slo_code || r.slo_code === 'UNKNOWN');

        if (coded.length > 0) {
          const { error: upsertErr } = await supabase
            .from('slo_database')
            .upsert(coded, { onConflict: 'document_id,slo_code' });
          if (upsertErr) console.error('[Stage 2] Upsert error:', upsertErr.message);
        }
        if (codeless.length > 0) {
          await supabase.from('slo_database').insert(codeless);
        }
      }

      console.log(`[Stage 2] Inserted ${slos.length} SLOs`);

      const ledger = buildLedger(slos, board, subject);
      await supabase.from('documents').update({
        extracted_text: ledger,
        document_summary: `ledger|slos:${slos.length}|board:${board}|subject:${subject}`,
        status: 'processing',
      }).eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.EMBED, progress: 75, message: 'Building vector index...',
      });
      job = await queue.getJobStatus(documentId);
    }

    // ════════════════════════════════════════════════════════
    // STAGE 3: ENRICH — skip, move straight to embed
    // ════════════════════════════════════════════════════════
    if (job.step === IngestionStep.ENRICH) {
      await queue.updateProgress(job.id, {
        step: IngestionStep.EMBED, progress: 75, message: 'Building vector index...',
      });
      job = await queue.getJobStatus(documentId);
    }

    // ════════════════════════════════════════════════════════
    // STAGE 4: EMBED — RAG vector index
    // ════════════════════════════════════════════════════════
    if (job.step === IngestionStep.EMBED) {
      console.log('[Stage 4] EMBED start');
      const { data: fin } = await supabase
        .from('documents').select('extracted_text').eq('id', documentId).single();
      const txt = fin?.extracted_text || '';

      if (txt.length >= 100) {
        await indexDocumentForRAG(documentId, txt, supabase, job.id);
      } else {
        console.warn(`[Stage 4] Text too short (${txt.length}) — skipping RAG`);
      }

      await queue.markComplete(job.id);

      const { error: docErr } = await supabase.from('documents').update({
        status: 'ready',
        rag_indexed: true,
        updated_at: new Date().toISOString(),
      }).eq('id', documentId);

      if (docErr) {
        console.error('[Stage 4] doc status update failed:', docErr.message);
        // Force update as fallback
        await supabase.rpc('force_doc_ready', { doc_id: documentId }).catch(() => {});
      }

      console.log(`[Stage 4] Complete — doc ${documentId} is ready`);
    }

    return NextResponse.json({ success: true, status: 'ready', progress: 100 });

  } catch (err: any) {
    const msg = String(err?.message || err).substring(0, 500);
    console.error(`[Ingestion FATAL] doc=${documentId}:`, msg);

    if (job?.id) {
      await queue.markFailed(job.id, msg).catch(() => {});
    }
    await supabase.from('documents')
      .update({ status: 'failed', document_summary: `error: ${msg}` })
      .eq('id', documentId)
      .catch(() => {});

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
