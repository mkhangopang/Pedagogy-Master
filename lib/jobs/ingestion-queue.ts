import { SupabaseClient } from '@supabase/supabase-js';
import { IngestionStep, JobStatus } from '../../types';

interface JobProgress {
  step: IngestionStep;
  progress: number;
  message: string;
}

/**
 * ASYNC INGESTION QUEUE (v1.0)
 * Logic: Simulates a persistent task runner for environments without native Bull/Redis support.
 * Uses Supabase 'ingestion_jobs' table as the state store.
 */
export class IngestionQueue {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Registers a new job in the persistent store.
   */
  async enqueue(documentId: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('ingestion_jobs')
      .insert({
        document_id: documentId,
        step: IngestionStep.EXTRACT,
        status: JobStatus.QUEUED,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  }

  /**
   * Updates the progress of a specific job.
   */
  async updateProgress(jobId: string, progress: JobProgress) {
    await this.supabase
      .from('ingestion_jobs')
      .update({
        step: progress.step,
        status: JobStatus.PROCESSING,
        payload: { ...progress },
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }

  /**
   * Finalizes the job.
   */
  async markComplete(jobId: string) {
    await this.supabase
      .from('ingestion_jobs')
      .update({
        status: JobStatus.COMPLETED,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }

  /**
   * Handles failure with error preservation.
   */
  async markFailed(jobId: string, error: string) {
    await this.supabase
      .from('ingestion_jobs')
      .update({
        status: JobStatus.FAILED,
        error_message: error,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }

  /**
   * Retrieval logic for UI polling.
   */
  async getJobStatus(documentId: string) {
    const { data } = await this.supabase
      .from('ingestion_jobs')
      .select('*')
      .eq('document_id', documentId)
      .neq('status', JobStatus.COMPLETED)
      .maybeSingle();
    
    return data;
  }
}
