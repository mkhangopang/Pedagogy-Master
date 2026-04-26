/**
 * CRON: Stale Ingestion Job Reaper
 * Route: POST /api/cron/reap-stale-jobs
 *
 * BUG-07 FIX: Jobs that exceed maxDuration (300s) get stuck in `processing`
 * status forever. Nothing previously marked them as failed or triggered a
 * retry. Users would see a spinner indefinitely.
 *
 * This cron runs every 10 minutes (configure in vercel.json or an external
 * scheduler) and:
 *   1. Finds jobs stuck in `processing` for > STALE_THRESHOLD_MS
 *   2. Marks them `failed` with a retriable error message
 *   3. Finds jobs stuck in `pending` for > PENDING_THRESHOLD_MS (never started)
 *   4. Marks those `failed` too
 *
 * Call via: POST /api/cron/reap-stale-jobs
 * Header:   x-cron-secret: <CRON_SECRET env var>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// A job is "stale" if it hasn't been updated in more than 10 minutes while processing
const STALE_PROCESSING_MS = 10 * 60 * 1000; // 10 minutes
// A job is "abandoned pending" if it hasn't started in more than 30 minutes
const STALE_PENDING_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const now = new Date();
  const staleProcessingCutoff = new Date(now.getTime() - STALE_PROCESSING_MS).toISOString();
  const stalePendingCutoff = new Date(now.getTime() - STALE_PENDING_MS).toISOString();

  const results = { reaped_processing: 0, reaped_pending: 0, errors: [] as string[] };

  // ── 1. Reap stale processing jobs ──────────────────────────────────────────
  const { data: staleProcessing, error: fetchErr1 } = await supabase
    .from('ingestion_jobs')
    .select('id, document_id, step, updated_at')
    .eq('status', 'processing')
    .lt('updated_at', staleProcessingCutoff);

  if (fetchErr1) {
    results.errors.push(`fetch_processing: ${fetchErr1.message}`);
  } else if (staleProcessing && staleProcessing.length > 0) {
    console.log(`[Reaper] Found ${staleProcessing.length} stale processing jobs`);

    for (const job of staleProcessing) {
      const minutesStale = Math.round((now.getTime() - new Date(job.updated_at).getTime()) / 60000);
      const { error: updateErr } = await supabase
        .from('ingestion_jobs')
        .update({
          status: 'failed',
          message: `Job timed out after ${minutesStale} minutes (last step: ${job.step}). Re-upload the document to retry.`,
          updated_at: now.toISOString(),
        })
        .eq('id', job.id);

      if (updateErr) {
        results.errors.push(`update_processing ${job.id}: ${updateErr.message}`);
      } else {
        results.reaped_processing++;
        // Also update the document status so the UI shows the error
        await supabase
          .from('documents')
          .update({
            status: 'failed',
            error_message: `Processing timed out after ${minutesStale}min. Please re-upload.`,
          })
          .eq('id', job.document_id);

        console.log(`[Reaper] Marked job ${job.id} (doc: ${job.document_id}) as failed (${minutesStale}min stale at step ${job.step})`);
      }
    }
  }

  // ── 2. Reap abandoned pending jobs ─────────────────────────────────────────
  const { data: stalePending, error: fetchErr2 } = await supabase
    .from('ingestion_jobs')
    .select('id, document_id, created_at')
    .eq('status', 'pending')
    .lt('created_at', stalePendingCutoff);

  if (fetchErr2) {
    results.errors.push(`fetch_pending: ${fetchErr2.message}`);
  } else if (stalePending && stalePending.length > 0) {
    console.log(`[Reaper] Found ${stalePending.length} abandoned pending jobs`);

    for (const job of stalePending) {
      const { error: updateErr } = await supabase
        .from('ingestion_jobs')
        .update({
          status: 'failed',
          message: 'Job was never picked up by a worker (serverless cold-start may have failed). Re-upload to retry.',
          updated_at: now.toISOString(),
        })
        .eq('id', job.id);

      if (updateErr) {
        results.errors.push(`update_pending ${job.id}: ${updateErr.message}`);
      } else {
        results.reaped_pending++;
        await supabase
          .from('documents')
          .update({
            status: 'failed',
            error_message: 'Processing never started. Please re-upload the document.',
          })
          .eq('id', job.document_id);
      }
    }
  }

  console.log(`[Reaper] Done. reaped_processing=${results.reaped_processing} reaped_pending=${results.reaped_pending} errors=${results.errors.length}`);

  return NextResponse.json({
    success: true,
    timestamp: now.toISOString(),
    ...results,
  });
}
