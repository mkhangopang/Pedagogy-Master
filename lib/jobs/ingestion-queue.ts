import { SupabaseClient } from '@supabase/supabase-js';
import { IngestionStep, JobStatus } from '../../types';

interface JobProgress {
  step: IngestionStep;
  progress: number;
  message: string;
  processedChunks?: number;
  processedOffset?: number;
}

/**
 * ASYNC INGESTION QUEUE (v2.0)
 *
 * FIX-BUG-03: getJobStatus now returns ALL jobs (including complete) so the process
 *   route can detect an already-finished job and return early instead of creating
 *   a new job and re-running the full pipeline.
 *
 * FIX-BUG-03b: markComplete now also sets step = COMPLETE so the process route's
 *   `job.step === IngestionStep.COMPLETE` guard works correctly.
 *
 * FIX-BUG-12: enqueue uses upsert to prevent duplicate rows when two requests
 *   arrive simultaneously for the same documentId.
 */
export class IngestionQueue {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Registers (or resets) a job in the persistent store.
   * Uses upsert to prevent duplicate-job race conditions.
   */
  async enqueue(documentId: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('ingestion_jobs')
      .upsert(
        {
          document_id: documentId,
          step: IngestionStep.EXTRACT,
          status: JobStatus.PENDING,
          error_message: null,
          payload: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'document_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return data.id;
  }

  /**
   * Updates the progress of a specific job.
   */
  async updateProgress(jobId: string, progress: JobProgress) {
    const { error } = await this.supabase
      .from('ingestion_jobs')
      .update({
        step: progress.step,
        status: JobStatus.PROCESSING,
        payload: { ...progress },
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    if (error) {
      console.error(`[IngestionQueue] updateProgress FAILED for ${jobId}:`, error);
      throw new Error(`QUEUE_UPDATE_ERROR: ${error.message}`);
    }
  }

  /**
   * Finalizes the job.
   * FIX-BUG-03b: Also sets step = COMPLETE so route-level guards work.
   */
  async markComplete(jobId: string) {
    const { error } = await this.supabase
      .from('ingestion_jobs')
      .update({
        status: JobStatus.COMPLETE,
        step: IngestionStep.COMPLETE,   // ← was missing; caused step-check to fail
        payload: { progress: 100, message: 'Complete' },
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) {
      console.error(`[IngestionQueue] markComplete FAILED for ${jobId}:`, error);
      throw new Error(`QUEUE_COMPLETE_ERROR: ${error.message}`);
    }
  }

  /**
   * Handles failure with error preservation.
   */
  async markFailed(jobId: string, error: string) {
    const { error: dbError } = await this.supabase
      .from('ingestion_jobs')
      .update({
        status: JobStatus.FAILED,
        error_message: error,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (dbError) {
      console.error(`[IngestionQueue] markFailed FAILED for ${jobId}:`, dbError);
    }
  }

  /**
   * FIX-BUG-03: Returns the most recent job for a document, including completed jobs.
   * Previously used .neq('status', 'complete') which hid finished jobs, causing
   * the route to create a new job and re-run ingestion on every heartbeat poll.
   */
  async getJobStatus(documentId: string) {
    const { data, error } = await this.supabase
      .from('ingestion_jobs')
      .select('*')
      .eq('document_id', documentId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[IngestionQueue] getJobStatus FAILED for ${documentId}:`, error);
      throw new Error(`VAULT_QUERY_ERROR: ${error.message}`);
    }
    return data;
  }
}
