import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep, JobStatus } from '../../../../../types';
import { GoogleGenAI } from "@google/genai";
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * NEURAL INGESTION ORCHESTRATOR (v5.0 - IP PROTECTED)
 * Logic: Fetches the 'Master Recipe' from DB before invoking the AI.
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
  }

  try {
    const { data: doc } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error("Document node missing.");

    // 0. FETCH SECRET MASTER RECIPE (IP PROTECTION)
    const { data: brain } = await adminSupabase.from('neural_brain').select('master_prompt').eq('id', 'system-brain').single();
    const masterRecipe = brain?.master_prompt;
    
    if (!masterRecipe) {
      throw new Error("Neural Grid Error: Master Ingestion Recipe not committed by Founder.");
    }

    // PHASE 1: EXTRACT
    if (job.step === IngestionStep.EXTRACT) {
      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error("Vault unreachable.");
      const rawResult = await pdf(buffer);
      await adminSupabase.from('documents').update({ extracted_text: rawResult.text.trim() }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.LINEARIZE }).eq('id', job.id);
      job.step = IngestionStep.LINEARIZE;
    }

    // PHASE 2: LINEARIZE (Using Secret DB Prompt)
    if (job.step === IngestionStep.LINEARIZE) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `[SYNTHESIS_REQUEST] Process this raw text into the Master MD Ledger.\n\nRAW_DATA:\n${currentDoc?.extracted_text?.substring(0, 100000)}`,
        config: {
          systemInstruction: masterRecipe,
          temperature: 0.1
        }
      });

      const architectOutput = response.text || "";
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
            await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
            await adminSupabase.from('slo_database').insert(sloRecords);
            
            if (sloIndex.length > 0) {
              await adminSupabase.from('documents').update({
                subject: sloIndex[0].subject || 'General',
                grade_level: sloIndex[0].grade ? `Grade ${sloIndex[0].grade}` : 'Auto',
                document_summary: `Linearized grid with ${sloIndex.length} surgical SLO nodes.`
              }).eq('id', documentId);
            }
          }
        } catch (e) { console.warn("JSON Index Parse Fault", e); }
      }

      await adminSupabase.from('documents').update({ extracted_text: architectOutput }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.EMBED }).eq('id', job.id);
      job.step = IngestionStep.EMBED;
    }

    // PHASE 3: EMBED
    if (job.step === IngestionStep.EMBED) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      await indexDocumentForRAG(documentId, currentDoc?.extracted_text || "", adminSupabase, job.id);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.FINALIZE, status: JobStatus.COMPLETED }).eq('id', job.id);
      await adminSupabase.from('documents').update({ status: 'ready', rag_indexed: true }).eq('id', documentId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    await adminSupabase.from('ingestion_jobs').update({ status: JobStatus.FAILED, error_message: error.message }).eq('id', job?.id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}