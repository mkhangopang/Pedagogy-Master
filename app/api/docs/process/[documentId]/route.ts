
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
 * EVENT-DRIVEN INGESTION ORCHESTRATOR (v2.0)
 * Logic: Step-Function state machine with failure isolation.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await props.params;
  const adminSupabase = getSupabaseAdminClient();

  try {
    // 1. Initialize Job State
    const { data: job } = await adminSupabase.from('ingestion_jobs').insert({
      document_id: documentId,
      step: IngestionStep.EXTRACT,
      status: JobStatus.PROCESSING
    }).select().single();

    const { data: doc } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error("Document node missing.");

    // STEP: EXTRACT
    await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.EXTRACT }).eq('id', job.id);
    const buffer = await getObjectBuffer(doc.file_path);
    if (!buffer) throw new Error("Vault unreachable.");
    const rawResult = await pdf(buffer);
    const rawText = rawResult.text.trim();

    // STEP: LINEARIZE (Gemini 3 Pro)
    await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.LINEARIZE }).eq('id', job.id);
    const cleanMd = await convertToPedagogicalMarkdown(rawText);

    // STEP: INDEX/EMBED
    await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.EMBED }).eq('id', job.id);
    await indexDocumentForRAG(documentId, cleanMd, doc.file_path, adminSupabase);

    // FINALIZE
    await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.FINALIZE, status: JobStatus.COMPLETED }).eq('id', job.id);
    await adminSupabase.from('documents').update({ extracted_text: cleanMd, status: 'ready' }).eq('id', documentId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    await adminSupabase.from('documents').update({ status: 'failed', error_message: error.message }).eq('id', documentId);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
