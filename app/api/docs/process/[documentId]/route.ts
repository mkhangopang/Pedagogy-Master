import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep, JobStatus } from '../../../../../types';
import { neuralGrid } from '../../../../../lib/ai/model-orchestrator';
import { DEFAULT_MASTER_PROMPT } from '../../../../../constants';
import { IngestionQueue } from '../../../../../lib/jobs/ingestion-queue';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * ORCHESTRATED INGESTION ENGINE v16.0
 * 
 * FIX from v15: 
 *   - Removed adminSupabase.rpc('reload_schema_cache') — this RPC does not exist
 *     in Supabase and was throwing AFTER status='ready' was written, causing
 *     the catch block to overwrite it with status='failed'.
 *   - chunk_slo_mapping insert wrapped in try/catch — table may not exist yet.
 *   - Status update is now the LAST operation before return in EMBED step.
 */

async function callLinearizer(content: string, recipe: string): Promise<string> {
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

  console.log(`[Linearizer] ${result.provider}/${result.modelUsed} — ${result.latencyMs}ms`);

  if (!result.text || result.text.length < 100) {
    throw new Error(`AI returned insufficient content (${result.text?.length || 0} chars)`);
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
    return NextResponse.json({ success: true, done: true, step: 'COMPLETE' });
  }

  try {
    const { data: doc } = await adminSupabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (!doc) throw new Error('VAULT_ERROR: Node missing.');

    // ─────────────────────────────────────────────────────────
    // STEP 1: EXTRACT — PDF → raw text (~5–15s)
    // ─────────────────────────────────────────────────────────
    if (job.step === IngestionStep.EXTRACT) {
      await queue.updateProgress(job.id, {
        step: IngestionStep.EXTRACT,
        progress: 10,
        message: 'Neural extraction...',
      });

      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error('R2_FAULT: Object unreachable.');

      const raw = await pdf(buffer);
      await adminSupabase.from('documents').update({
        raw_text: raw.text.trim(),
        extracted_text: raw.text.trim(),
      }).eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE,
        progress: 25,
        message: 'Extraction complete. Ready for linearization.',
      });

      return NextResponse.json({
        success: true,
        done: false,
        step: 'EXTRACT',
        nextStep: 'LINEARIZE',
        progress: 25,
        message: 'Step 1/3 complete. Call again to linearize.',
      });
    }

    // ─────────────────────────────────────────────────────────
    // STEP 2: LINEARIZE — AI pedagogical processing (~30–55s)
    // ─────────────────────────────────────────────────────────
    if (job.step === IngestionStep.LINEARIZE) {
      await queue.updateProgress(job.id, {
        step: IngestionStep.LINEARIZE,
        progress: 30,
        message: 'Pedagogical linearization in progress...',
      });

      const { data: brain } = await adminSupabase
        .from('neural_brain')
        .select('master_prompt')
        .eq('id', 'system-brain')
        .maybeSingle();

      const recipe = brain?.master_prompt || DEFAULT_MASTER_PROMPT;

      const { data: current } = await adminSupabase
        .from('documents')
        .select('extracted_text')
        .eq('id', documentId)
        .single();

      const markdown = await callLinearizer(current?.extracted_text || '', recipe);

      // Parse and store SLO index
      const indexMatch = markdown.match(/<STRUCTURED_INDEX>([\s\S]+?)<\/STRUCTURED_INDEX>/);
      if (indexMatch) {
        try {
          const sloIndex = JSON.parse(
            indexMatch[1].trim().replace(/```json|```/g, '').trim()
          );
          if (Array.isArray(sloIndex)) {
            const records = sloIndex
              .filter((s: any) => s.slo_code || s.code)
              .map((s: any) => ({
                document_id: documentId,
                slo_code: (s.slo_code || s.code || '').toUpperCase().trim(),
                slo_full_text: s.slo_full_text || s.text || '',
                bloom_level: s.bloomLevel || 'Understand',
                domain: s.domain || '',
                domain_name: s.domain_name || '',
                grade: s.grade || '',
                subject: s.subject || '',
                code_valid: /^[A-Z]{2,3}\d{2}[A-Z]\d{2}$/.test(
                  (s.slo_code || s.code || '').toUpperCase().trim()
                ),
              }));

            await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
            await adminSupabase.from('slo_database').insert(records);
          }
        } catch (e) {
          console.error('Structured Index parse failure — continuing anyway:', e);
          // Non-fatal: continue processing even if SLO index fails
        }
      }

      await adminSupabase
        .from('documents')
        .update({ extracted_text: markdown })
        .eq('id', documentId);

      await queue.updateProgress(job.id, {
        step: IngestionStep.EMBED,
        progress: 60,
        message: 'Linearization complete. Ready for vector indexing.',
      });

      return NextResponse.json({
        success: true,
        done: false,
        step: 'LINEARIZE',
        nextStep: 'EMBED',
        progress: 60,
        message: 'Step 2/3 complete. Call again to embed.',
      });
    }

    // ─────────────────────────────────────────────────────────
    // STEP 3: EMBED — Vector indexing + chunk mapping (~10–30s)
    // ─────────────────────────────────────────────────────────
    if (job.step === IngestionStep.EMBED) {
      await queue.updateProgress(job.id, {
        step: IngestionStep.EMBED,
        progress: 65,
        message: 'Vector mapping in progress...',
      });

      const { data: finalDoc } = await adminSupabase
        .from('documents')
        .select('extracted_text')
        .eq('id', documentId)
        .single();

      await indexDocumentForRAG(
        documentId,
        finalDoc?.extracted_text || '',
        adminSupabase,
        job.id
      );

      // Build chunk ↔ SLO mappings
      // Wrapped in try/catch — chunk_slo_mapping table may not exist yet
      // This is NON-FATAL: document is still fully usable without mappings
      try {
        const { data: chunks } = await adminSupabase
          .from('document_chunks')
          .select('id, slo_codes')
          .eq('document_id', documentId);

        const { data: slos } = await adminSupabase
          .from('slo_database')
          .select('id, slo_code')
          .eq('document_id', documentId);

        if (chunks && slos && chunks.length > 0 && slos.length > 0) {
          const sloCodeToId = Object.fromEntries(slos.map((s) => [s.slo_code, s.id]));
          const mappings: any[] = [];

          chunks.forEach((chunk) => {
            (chunk.slo_codes || []).forEach((code: string) => {
              if (sloCodeToId[code]) {
                mappings.push({ chunk_id: chunk.id, slo_id: sloCodeToId[code], slo_code: code });
              }
            });
          });

          if (mappings.length > 0) {
            await adminSupabase.from('chunk_slo_mapping').insert(mappings);
          }
        }
      } catch (mappingErr) {
        // Non-fatal — log and continue to status update
        console.warn('[EMBED] chunk_slo_mapping insert skipped:', mappingErr);
      }

      // ── CRITICAL: Mark job complete and document ready ──
      // This MUST be last. Nothing after this line should throw.
      await queue.markComplete(job.id);

      await adminSupabase.from('documents').update({
        status: 'ready',
        rag_indexed: true,
        document_summary: 'Neural grid verified.',
      }).eq('id', documentId);

      return NextResponse.json({
        success: true,
        done: true,
        step: 'EMBED',
        progress: 100,
        message: 'All 3 steps complete. Document is ready.',
      });
    }

    return NextResponse.json({ error: 'Unknown step state', step: job.step }, { status: 400 });

  } catch (err: any) {
    const msg = err.message || 'Synthesis grid exception.';
    console.error('[ProcessRoute] Fatal error:', msg);

    try { await queue.markFailed(job.id, msg); } catch (_) {}

    await adminSupabase.from('documents').update({
      status: 'failed',
      document_summary: msg,
    }).eq('id', documentId);

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
