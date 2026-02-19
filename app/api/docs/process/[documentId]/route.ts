import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep, JobStatus } from '../../../../../types';
import { GoogleGenAI } from "@google/genai";
import { DEFAULT_MASTER_PROMPT } from '../../../../../constants';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * ATOMIC INGESTION ORCHESTRATOR v12.0 (RALPH FIX)
 * Resumes work from internal state markers to prevent timeouts and desync.
 */
async function callLinearizer(content: string, recipe: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `[TASK: LINEARIZE_CURRICULUM] 
    Apply the Master Recipe to this curriculum data. 
    MANDATORY: Wrap extracted SLOs in <STRUCTURED_INDEX> JSON tags.
    
    DATA:
    ${content.substring(0, 100000)}`,
    config: {
      systemInstruction: recipe,
      temperature: 0.1,
      thinkingConfig: { thinkingBudget: 4096 }
    }
  });
  return response.text || "";
}

export async function POST(req: NextRequest, props: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await props.params;
  const adminSupabase = getSupabaseAdminClient();

  // Load or Create persistent job state
  let { data: job } = await adminSupabase.from('ingestion_jobs')
    .select('*').eq('document_id', documentId).neq('status', JobStatus.COMPLETED).maybeSingle();

  if (!job) {
    const { data: newJob } = await adminSupabase.from('ingestion_jobs').insert({
      document_id: documentId, step: IngestionStep.EXTRACT, status: JobStatus.PROCESSING
    }).select().single();
    job = newJob;
  }

  try {
    const { data: doc } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error("VAULT_ERROR: Record missing.");

    const { data: brain } = await adminSupabase.from('neural_brain').select('master_prompt').eq('id', 'system-brain').maybeSingle();
    const recipe = brain?.master_prompt || DEFAULT_MASTER_PROMPT;

    // STEP 1: PARSE
    if (job.step === IngestionStep.EXTRACT) {
      await adminSupabase.from('documents').update({ document_summary: 'Bit-level extraction...' }).eq('id', documentId);
      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error("R2_FAULT: Object unreachable.");
      const raw = await pdf(buffer);
      await adminSupabase.from('documents').update({ extracted_text: raw.text.trim(), document_summary: 'Mapping domains...' }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.LINEARIZE }).eq('id', job.id);
      job.step = IngestionStep.LINEARIZE;
    }

    // STEP 2: LINEARIZE & TAG
    if (job.step === IngestionStep.LINEARIZE) {
      const { data: current } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const markdown = await callLinearizer(current?.extracted_text || "", recipe);
      
      const indexMatch = markdown.match(/<STRUCTURED_INDEX>([\s\S]+?)<\/STRUCTURED_INDEX>/);
      if (indexMatch) {
        try {
          const sloIndex = JSON.parse(indexMatch[1].trim().replace(/```json|```/g, '').trim());
          if (Array.isArray(sloIndex)) {
            const records = sloIndex.map((s: any) => ({
              document_id: documentId,
              slo_code: s.code || s.slo_code,
              slo_full_text: s.text || s.slo_full_text,
              bloom_level: s.bloomLevel || 'Understand'
            }));
            await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
            await adminSupabase.from('slo_database').insert(records);
          }
        } catch (e) { console.error("Structured Index Failure", e); }
      }

      await adminSupabase.from('documents').update({ extracted_text: markdown }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.EMBED }).eq('id', job.id);
      job.step = IngestionStep.EMBED;
    }

    // STEP 3: VECTOR INDEX
    if (job.step === IngestionStep.EMBED) {
      const { data: finalDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      await indexDocumentForRAG(documentId, finalDoc?.extracted_text || "", adminSupabase, job.id);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.FINALIZE, status: JobStatus.COMPLETED }).eq('id', job.id);
      await adminSupabase.from('documents').update({ status: 'ready', rag_indexed: true, document_summary: 'Neural grid verified.' }).eq('id', documentId);
      await adminSupabase.rpc('reload_schema_cache');
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    const msg = err.message || "Unknown Orchestration Fault";
    await adminSupabase.from('ingestion_jobs').update({ status: JobStatus.FAILED, error_message: msg }).eq('id', job?.id);
    await adminSupabase.from('documents').update({ status: 'failed', document_summary: msg }).eq('id', documentId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}