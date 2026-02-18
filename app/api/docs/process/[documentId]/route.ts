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
 * NEURAL INGESTION ORCHESTRATOR v6.0 (IP PROTECTED)
 * Logic: Fetches the Master Recipe (IP) from the private DB vault.
 * Handshake ensures the public repo contains zero pedagogical logic.
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
    if (!doc) throw new Error("Document node missing in vault.");

    // 0. SECURE HANDSHAKE: FETCH IP FROM FOUNDER VAULT
    const { data: brain } = await adminSupabase.from('neural_brain').select('master_prompt').eq('id', 'system-brain').single();
    const masterRecipe = brain?.master_prompt;
    
    if (!masterRecipe) {
      throw new Error("Neural Grid Error: Master Recipe not committed. Access Admin Console to initialize IP.");
    }

    // PHASE 1: OCR & EXTRACTION
    if (job.step === IngestionStep.EXTRACT) {
      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error("R2 Node unreachable or asset missing.");
      
      const rawResult = await pdf(buffer);
      await adminSupabase.from('documents').update({ extracted_text: rawResult.text.trim() }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.LINEARIZE }).eq('id', job.id);
      job.step = IngestionStep.LINEARIZE;
    }

    // PHASE 2: LINEARIZATION & DOMAIN MAPPING (Using Secret IP)
    if (job.step === IngestionStep.LINEARIZE) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `[SYSTEM_INGESTION_TASK] Process the following curriculum data into the Master MD format and extract a structured index.\n\nRAW_DATA_INPUT:\n${currentDoc?.extracted_text?.substring(0, 100000)}`,
        config: {
          systemInstruction: masterRecipe,
          temperature: 0.1
        }
      });

      const processedMarkdown = response.text || "";
      
      // Look for the Structured JSON index to populate the surgical ledger
      const indexMatch = processedMarkdown.match(/<STRUCTURED_INDEX>([\s\S]+?)<\/STRUCTURED_INDEX>/);
      
      if (indexMatch) {
        try {
          const sloIndex = JSON.parse(indexMatch[1].trim());
          if (Array.isArray(sloIndex)) {
            const sloRecords = sloIndex.map((s: any) => ({
              document_id: documentId,
              slo_code: s.code || s.slo_code,
              slo_full_text: s.text || s.slo_full_text,
              bloom_level: s.bloomLevel || s.bloom_level || 'Understand',
              created_at: new Date().toISOString()
            }));

            // Sync Database
            await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
            const { error: insertError } = await adminSupabase.from('slo_database').insert(sloRecords);
            
            if (!insertError && sloIndex.length > 0) {
              await adminSupabase.from('documents').update({
                subject: sloIndex[0].subject || doc.subject,
                grade_level: sloIndex[0].grade ? `Grade ${sloIndex[0].grade}` : doc.grade_level,
                document_summary: `Linearized ledger with ${sloIndex.length} surgical standards.`
              }).eq('id', documentId);
            }
          }
        } catch (e) {
          console.warn("Structured Index Parse Fault", e);
        }
      }

      await adminSupabase.from('documents').update({ extracted_text: processedMarkdown }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.EMBED }).eq('id', job.id);
      job.step = IngestionStep.EMBED;
    }

    // PHASE 3: VECTOR INDEXING
    if (job.step === IngestionStep.EMBED) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      await indexDocumentForRAG(documentId, currentDoc?.extracted_text || "", adminSupabase, job.id);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.FINALIZE, status: JobStatus.COMPLETED }).eq('id', job.id);
      await adminSupabase.from('documents').update({ status: 'ready', rag_indexed: true }).eq('id', documentId);
    }

    return NextResponse.json({ success: true, message: "Neural alignment synchronized." });
  } catch (error: any) {
    console.error("❌ [Orchestrator Fault]:", error.message);
    await adminSupabase.from('ingestion_jobs').update({ status: JobStatus.FAILED, error_message: error.message }).eq('id', job?.id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}