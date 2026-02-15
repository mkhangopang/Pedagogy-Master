
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { convertToPedagogicalMarkdown } from '../../../../../lib/rag/md-converter';
import { IngestionStep, JobStatus } from '../../../../../types';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * NEURAL INGESTION ORCHESTRATOR (v3.0)
 * Uses the ingestion_jobs state machine for failure isolation and recovery.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await props.params;
  const adminSupabase = getSupabaseAdminClient();

  // 1. Initialize or find existing Job
  let { data: job } = await adminSupabase.from('ingestion_jobs')
    .select('*')
    .eq('document_id', documentId)
    .neq('status', JobStatus.COMPLETED)
    .maybeSingle();

  if (!job) {
    const { data: newJob } = await adminSupabase.from('ingestion_jobs').insert({
      document_id: documentId,
      step: IngestionStep.EXTRACT,
      status: JobStatus.PROCESSING
    }).select().single();
    job = newJob;
  } else {
    await adminSupabase.from('ingestion_jobs').update({ status: JobStatus.PROCESSING }).eq('id', job.id);
  }

  try {
    const { data: doc } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error("Document node missing.");

    // STEP: EXTRACT (Binary -> Text)
    if (job.step === IngestionStep.EXTRACT) {
      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error("Vault unreachable.");
      const rawResult = await pdf(buffer);
      const rawText = rawResult.text.trim();
      
      await adminSupabase.from('documents').update({ extracted_text: rawText }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.LINEARIZE }).eq('id', job.id);
      job.step = IngestionStep.LINEARIZE;
    }

    // STEP: LINEARIZE (Raw -> Master MD)
    if (job.step === IngestionStep.LINEARIZE) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const cleanMd = await convertToPedagogicalMarkdown(currentDoc?.extracted_text || "");
      
      await adminSupabase.from('documents').update({ extracted_text: cleanMd }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.EMBED }).eq('id', job.id);
      job.step = IngestionStep.EMBED;
    }

    // STEP: EMBED (Master MD -> Vector Chunks)
    if (job.step === IngestionStep.EMBED) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      await indexDocumentForRAG(documentId, currentDoc?.extracted_text || "", adminSupabase, job.id);
      
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.FINALIZE, status: JobStatus.COMPLETED }).eq('id', job.id);
      await adminSupabase.from('documents').update({ status: 'ready', rag_indexed: true }).eq('id', documentId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    await adminSupabase.from('ingestion_jobs').update({ 
      status: JobStatus.FAILED, 
      error_message: error.message,
      retry_count: (job?.retry_count || 0) + 1
    }).eq('id', job?.id);
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
