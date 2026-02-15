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
 * NEURAL INGESTION ORCHESTRATOR (v4.0)
 * FEATURE: JSON Metadata Extraction & Structured SLO Database Population.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await props.params;
  const adminSupabase = getSupabaseAdminClient();

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

    // STEP: EXTRACT
    if (job.step === IngestionStep.EXTRACT) {
      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error("Vault unreachable.");
      const rawResult = await pdf(buffer);
      const rawText = rawResult.text.trim();
      
      await adminSupabase.from('documents').update({ extracted_text: rawText }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.LINEARIZE }).eq('id', job.id);
      job.step = IngestionStep.LINEARIZE;
    }

    // STEP: LINEARIZE (Raw -> Master MD + JSON Index)
    if (job.step === IngestionStep.LINEARIZE) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const architectOutput = await convertToPedagogicalMarkdown(currentDoc?.extracted_text || "");
      
      // Extract Structured Index
      const indexMatch = architectOutput.match(/<STRUCTURED_INDEX>([\s\S]+?)<\/STRUCTURED_INDEX>/);
      if (indexMatch) {
        try {
           const sloIndex = JSON.parse(indexMatch[1].trim());
           if (Array.isArray(sloIndex)) {
             const sloRecords = sloIndex.map((s: any) => ({
               document_id: documentId,
               slo_code: s.code,
               slo_full_text: s.text,
               bloom_level: s.bloomLevel || 'Understand',
               created_at: new Date().toISOString()
             }));
             
             // Populate surgical database
             await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
             await adminSupabase.from('slo_database').insert(sloRecords);
             
             // Update main doc metadata
             if (sloIndex.length > 0) {
                await adminSupabase.from('documents').update({
                  subject: sloIndex[0].subject,
                  grade_level: `Grade ${sloIndex[0].grade}`,
                  authority: 'Master MD Generated'
                }).eq('id', documentId);
             }
           }
        } catch (e) {
          console.warn("Structured Index Parse Failure:", e);
        }
      }

      await adminSupabase.from('documents').update({ extracted_text: architectOutput }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.EMBED }).eq('id', job.id);
      job.step = IngestionStep.EMBED;
    }

    // STEP: EMBED
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