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

async function callLinearizer(content: string, recipe: string): Promise<string> {
  if (content.includes('<STRUCTURED_INDEX>') && content.length > 2000) {
    console.log('[Linearizer] Vision already structured — skipping AI linearization');
    return content;
  }
  const safeContent = content.substring(0, 60000);
  const result = await neuralGrid.execute(
    `[CURRICULUM_LINEARIZATION_TASK]
Apply the Master Recipe instructions precisely.
MANDATORY: Include <STRUCTURED_INDEX> JSON block at the very end.
SLO CODE FORMAT: SUBJECTCODE+GRADE(2digits)+DOMAIN(letter)+NUMBER(2digits)
Example: BIO09A01, MAT11B03, ENG07C12
=== MASTER RECIPE ===
${recipe}
=== RAW CURRICULUM TEXT ===
${safeContent}
=== END TEXT ===`,
    'INGEST_LINEARIZE',
    { temperature: 0.1, maxTokens: 8192 }
  );
  if (!result.text || result.text.length < 100) {
    throw new Error(`AI linearizer returned insufficient content (${result.text?.length || 0} chars)`);
  }
  return result.text;
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
    if (job.step === IngestionStep.LINEARIZE) {
      await queue.updateProgress(job.id, { step: IngestionStep.LINEARIZE, progress: 38, message: 'AI structuring curriculum...' });

      const { data: brain } = await adminSupabase.from('neural_brain').select('master_prompt').eq('id', 'system-brain').maybeSingle();
      const recipe = brain?.master_prompt || DEFAULT_MASTER_PROMPT;
      const { data: current } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const rawText = current?.extracted_text || '';

      if (rawText.length < 100) throw new Error('LINEARIZE_FAULT: No extracted text found from step 1.');

      const markdown = await callLinearizer(rawText, recipe);

      let sloCount = 0;
      const indexMatch = markdown.match(/<STRUCTURED_INDEX>([\s\S]+?)<\/STRUCTURED_INDEX>/);
      if (indexMatch) {
        try {
          const sloIndex = JSON.parse(indexMatch[1].trim().replace(/```json|```/g, '').trim());
          if (Array.isArray(sloIndex) && sloIndex.length > 0) {
            const records = sloIndex
              .filter((s: any) => s.slo_code || s.code)
              .map((s: any) => ({
                document_id: documentId,
                slo_code: (s.slo_code || s.code || '').toUpperCase().trim(),
                slo_full_text: s.slo_full_text || s.text || '',
                bloom_level: s.bloom_level || s.bloomLevel || 'Understand',
                subject: s.subject || '',
                grade_level: s.grade || '',
                cognitive_complexity: s.bloom_level || 'Understand',
                teaching_strategies: [],
                assessment_ideas: [],
                prerequisite_concepts: [],
                common_misconceptions: [],
                keywords: [],
              }));
            await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
            await adminSupabase.from('slo_database').insert(records);
            sloCount = records.length;
          }
        } catch (e) { console.error('[LINEARIZE] SLO parse failed (non-fatal):', e); }
      }

      await adminSupabase.from('documents').update({
        extracted_text: markdown,
        document_summary: `Linearized — ${sloCount} SLOs`,
      }).eq('id', documentId);

      await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 63, message: `${sloCount} SLOs extracted. Building vectors...` });

      return NextResponse.json({
        success: true, done: false, step: 'LINEARIZE', nextStep: 'EMBED',
        progress: 63, sloCount, message: `Step 2/3 complete. ${sloCount} SLOs found.`,
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
