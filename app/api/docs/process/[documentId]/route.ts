import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { smartExtractPDF } from '../../../../../lib/rag/vision-extractor';
import { IngestionStep } from '../../../../../types';
import { neuralGrid } from '../../../../../lib/ai/model-orchestrator';
import { DEFAULT_MASTER_PROMPT } from '../../../../../constants';
import { IngestionQueue } from '../../../../../lib/jobs/ingestion-queue';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * ORCHESTRATED INGESTION ENGINE v17.0 — Vision-First Extraction
 * 1. EXTRACT: smartExtractPDF — text layer for digital, Gemini Vision for scanned
 * 2. LINEARIZE: AI structures content + extracts SLO index
 * 3. EMBED: Vector indexing + chunk-SLO mapping
 * FIX: No rpc() calls, safe status guard, quality checks at each step
 */

// HOBBY PLAN TIMEOUT FIX:
// Process ONE chunk per Vercel call (~5s each, well under 60s limit)
// Client drives the loop by calling this route repeatedly until done
async function processOneChunk(
  content: string,
  chunkIndex: number
): Promise<{ slos: any[], totalChunks: number, isDone: boolean }> {
  const CHUNK_SIZE = 18000;
  const OVERLAP    = 500;

  // Build chunk boundaries
  const chunks: Array<{start: number, end: number}> = [];
  for (let i = 0; i < content.length; i += CHUNK_SIZE - OVERLAP) {
    chunks.push({ start: i, end: Math.min(i + CHUNK_SIZE, content.length) });
    if (i + CHUNK_SIZE >= content.length) break;
  }

  const totalChunks = chunks.length;
  if (chunkIndex >= totalChunks) {
    return { slos: [], totalChunks, isDone: true };
  }

  const { start, end } = chunks[chunkIndex];
  const chunk = content.substring(start, end);

  console.log(`[Linearizer] Chunk ${chunkIndex + 1}/${totalChunks} (${chunk.length} chars)`);

  const result = await neuralGrid.execute(
    `Extract ALL SLO codes from this curriculum text. Return ONLY a raw JSON array, no explanation, no markdown.

Each item: { "slo_code", "slo_full_text", "bloom_level", "domain", "domain_name", "grade", "subject" }
If no SLOs found return: []

CHUNK ${chunkIndex + 1}/${totalChunks}:
${chunk}`,
    'INGEST_LINEARIZE',
    { temperature: 0.0, maxTokens: 4096 }
  );

  let slos: any[] = [];
  try {
    const text = result.text.trim().replace(/```json|```/g, '').trim();
    const indexMatch = text.match(/<STRUCTURED_INDEX>([\s\S]+?)<\/STRUCTURED_INDEX>/);
    const jsonText = indexMatch ? indexMatch[1].trim() : text;
    const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
    if (arrayMatch) slos = JSON.parse(arrayMatch[0]);
  } catch (e) {
    console.warn(`[Linearizer] Chunk ${chunkIndex + 1} parse failed — continuing`);
  }

  console.log(`[Linearizer] Chunk ${chunkIndex + 1}: ${slos.length} SLOs found`);
  return { slos, totalChunks, isDone: chunkIndex >= totalChunks - 1 };
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const adminSupabase = getSupabaseAdminClient();
  const queue = new IngestionQueue(adminSupabase);

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

    // ── STEP 1: EXTRACT ──────────────────────────────────────
    if (job.step === IngestionStep.EXTRACT) {
      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 10, message: 'Fetching from storage...' });
      await adminSupabase.from('documents').update({ status: 'processing', document_summary: 'Extracting...' }).eq('id', documentId);

      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error('R2_FAULT: File unreachable. Check Cloudflare R2 CORS policy — allowed origins must include your Vercel domain.');

      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 18, message: 'Detecting document type...' });

      const extraction = await smartExtractPDF(buffer, doc.name || 'document.pdf');

      if (!extraction.text || extraction.text.length < 300) {
        throw new Error(`Low quality extraction (${extraction.text?.length || 0} chars via ${extraction.method}). Document may be corrupted, password-protected, or in an unsupported format.`);
      }

      await adminSupabase.from('documents').update({
        extracted_text: extraction.text.substring(0, 100000),
        document_summary: `Extracted via ${extraction.method} — ${extraction.text.length} chars`,
      }).eq('id', documentId);

      await queue.updateProgress(job.id, { step: IngestionStep.LINEARIZE, progress: 30, message: `${extraction.method === 'vision' ? 'Vision' : 'Text'} extraction complete.` });

      return NextResponse.json({
        success: true, done: false, step: 'EXTRACT', nextStep: 'LINEARIZE',
        progress: 30, method: extraction.method, charCount: extraction.text.length,
        message: 'Step 1/3 complete. Call again to linearize.',
      });
    }

    // ── STEP 2: LINEARIZE ─────────────────────────────────────
    // HOBBY PLAN FIX: One chunk per call, client loops until isDone
    // CRITICAL: Read chunkIndex from body — do NOT rely on job.step for routing
    if (job.step === IngestionStep.LINEARIZE || requestBody.chunkIndex !== undefined) {
      const chunkIndex: number = requestBody.chunkIndex ?? 0;

      const { data: current, error: fetchErr } = await adminSupabase
        .from('documents').select('extracted_text').eq('id', documentId).single();
      if (fetchErr) throw new Error(`LINEARIZE_FAULT: DB read failed — ${fetchErr.message}`);

      const rawText = current?.extracted_text || '';
      if (rawText.length < 100) {
        throw new Error(`LINEARIZE_FAULT: No extracted text (${rawText.length} chars). Step 1 may have failed.`);
      }

      const totalChunks = Math.ceil((rawText.length) / 17500);

      // Only update progress — do NOT advance step yet
      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE,
        progress: 35 + Math.round(((chunkIndex + 1) / totalChunks) * 25),
        message: `Processing chunk ${chunkIndex + 1}/${totalChunks}...`,
      });

      const { slos, isDone } = await processOneChunk(rawText, chunkIndex);

      // Upsert SLOs from this chunk into slo_database
      if (slos.length > 0) {
        const records = slos
          .filter((s: any) => s.slo_code)
          .map((s: any) => ({
            document_id: documentId,
            slo_code: (s.slo_code || '').toUpperCase().trim(),
            slo_full_text: s.slo_full_text || '',
            bloom_level: s.bloom_level || 'Understand',
            subject: s.subject || '',
            grade_level: s.grade || '',
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

      const progressPct = 35 + Math.round(((chunkIndex + 1) / totalChunks) * 25);

      if (!isDone) {
        // More chunks remain — tell client to call again with next chunkIndex
        // DO NOT advance job step here
        return NextResponse.json({
          success: true,
          done: false,
          step: 'LINEARIZE',
          nextStep: 'LINEARIZE',
          chunkIndex: chunkIndex + 1,
          totalChunks,
          progress: progressPct,
          slosThisChunk: slos.length,
          message: `Chunk ${chunkIndex + 1}/${totalChunks} done — ${slos.length} SLOs`,
        });
      }

      // ── ALL CHUNKS DONE ── now advance to EMBED
      const { count: sloCount } = await adminSupabase
        .from('slo_database')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', documentId);

      const { data: allSlos } = await adminSupabase
        .from('slo_database').select('*').eq('document_id', documentId);
      const markdown = `### Curriculum SLOs\n\n<STRUCTURED_INDEX>\n${JSON.stringify(allSlos, null, 2)}\n</STRUCTURED_INDEX>`;

      await adminSupabase.from('documents').update({
        extracted_text: markdown,
        document_summary: `Linearized — ${sloCount || 0} SLOs`,
      }).eq('id', documentId);

      // NOW advance job step to EMBED
      await queue.updateProgress(job.id, {
        step: IngestionStep.EMBED,
        progress: 63,
        message: `${sloCount} SLOs extracted. Building vectors...`,
      });

      return NextResponse.json({
        success: true, done: false, step: 'LINEARIZE', nextStep: 'EMBED',
        progress: 63, sloCount,
        message: `Step 2/3 complete — ${sloCount} SLOs extracted.`,
      });
    }

    // ── STEP 3: EMBED ─────────────────────────────────────────
    if (job.step === IngestionStep.EMBED) {
      await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 70, message: 'Building vector index...' });

      const { data: finalDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const textToEmbed = finalDoc?.extracted_text || '';
      if (textToEmbed.length < 100) throw new Error('EMBED_FAULT: No text to embed.');

      const result = await indexDocumentForRAG(documentId, textToEmbed, adminSupabase, job.id);
      const chunkCount = result?.count || 0;

      // Chunk-SLO mappings (non-fatal)
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

      // CRITICAL — mark complete LAST, nothing after this
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
    console.error(`[Route] Fatal:`, msg);
    try { await queue.markFailed(job.id, msg); } catch (_) {}
    // Guard: never overwrite a successfully ready document
    const { data: cur } = await adminSupabase.from('documents').select('status').eq('id', documentId).single();
    if (cur?.status !== 'ready') {
      await adminSupabase.from('documents').update({ status: 'failed', document_summary: msg.substring(0, 500) }).eq('id', documentId);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
