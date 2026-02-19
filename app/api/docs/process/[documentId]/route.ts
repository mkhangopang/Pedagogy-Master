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
 * NEURAL INGESTION ORCHESTRATOR v11.0
 * Logic: Atomic step-locking with structural verification.
 */
async function callSurgicalLinearizer(content: string, recipe: string, model: string = 'gemini-3-pro-preview'): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: `[CRITICAL_SYSTEM_TASK: LINEARIZE_CURRICULUM] 
      Apply the Master Recipe to this document.
      REQUIREMENT: You MUST include the <STRUCTURED_INDEX> JSON block at the end.
      
      INPUT_DATA:
      ${content.substring(0, 100000)}`,
      config: {
        systemInstruction: recipe,
        temperature: 0.1,
        thinkingConfig: model.includes('pro') ? { thinkingBudget: 4096 } : { thinkingBudget: 0 }
      }
    });

    if (!response.text) throw new Error("Synthesis Node returned empty grid.");
    return response.text;
  } catch (err: any) {
    if (err.message?.includes('429') || err.status === 429) {
      return callSurgicalLinearizer(content, recipe, 'gemini-3-flash-preview');
    }
    throw err;
  }
}

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
    if (!doc) throw new Error("Vault node missing.");

    const { data: brain } = await adminSupabase.from('neural_brain')
      .select('master_prompt')
      .eq('id', 'system-brain')
      .maybeSingle();
    
    const masterRecipe = brain?.master_prompt || DEFAULT_MASTER_PROMPT;

    // STEP 1: PHYSICAL EXTRACTION
    if (job.step === IngestionStep.EXTRACT) {
      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error("R2_ASSET_UNREACHABLE");
      
      const rawResult = await pdf(buffer);
      if (!rawResult.text || rawResult.text.trim().length < 20) {
        throw new Error("EMPTY_DATA_EXTRACTION");
      }

      await adminSupabase.from('documents').update({ 
        extracted_text: rawResult.text.trim(),
        document_summary: 'Processing neural domains...' 
      }).eq('id', documentId);
      
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.LINEARIZE }).eq('id', job.id);
      job.step = IngestionStep.LINEARIZE;
    }

    // STEP 2: PEDAGOGICAL LINEARIZATION
    if (job.step === IngestionStep.LINEARIZE) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const processedMarkdown = await callSurgicalLinearizer(currentDoc?.extracted_text || "", masterRecipe);
      
      const indexMatch = processedMarkdown.match(/<STRUCTURED_INDEX>([\s\S]+?)<\/STRUCTURED_INDEX>/);
      if (indexMatch) {
        try {
          let jsonStr = indexMatch[1].trim().replace(/```json|```/g, '').trim();
          const sloIndex = JSON.parse(jsonStr);
          if (Array.isArray(sloIndex)) {
            const sloRecords = sloIndex.map((s: any) => ({
              document_id: documentId,
              slo_code: s.code || s.slo_code || "CODE_ERR",
              slo_full_text: s.text || s.slo_full_text || "TEXT_ERR",
              bloom_level: s.bloomLevel || 'Understand'
            }));
            
            await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
            const { error: sloError } = await adminSupabase.from('slo_database').insert(sloRecords);
            if (sloError) console.error("❌ SLO_DB_INSERT_FAULT:", sloError.message);
          }
        } catch (e) {
          console.error("❌ STRUCTURED_INDEX_PARSING_FAULT:", e);
        }
      }

      await adminSupabase.from('documents').update({ extracted_text: processedMarkdown }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.EMBED }).eq('id', job.id);
      job.step = IngestionStep.EMBED;
    }

    // STEP 3: VECTOR INDEXING
    if (job.step === IngestionStep.EMBED) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      
      try {
        await indexDocumentForRAG(documentId, currentDoc?.extracted_text || "", adminSupabase, job.id);
      } catch (ragErr: any) {
        if (ragErr.message?.includes('token_count') || ragErr.message?.includes('column')) {
           throw new Error("INFRASTRUCTURE_STALE: 'token_count' column missing. Run SQL Blueprint v9.0.");
        }
        throw ragErr;
      }

      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.FINALIZE, status: JobStatus.COMPLETED }).eq('id', job.id);
      await adminSupabase.from('documents').update({ status: 'ready', rag_indexed: true, document_summary: 'Neural alignment verified.' }).eq('id', documentId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ [Orchestrator Fault]:", error.message);
    const msg = error.message || "Unknown Synthesis Bottleneck";
    await adminSupabase.from('ingestion_jobs').update({ status: JobStatus.FAILED, error_message: msg }).eq('id', job?.id);
    await adminSupabase.from('documents').update({ status: 'failed', document_summary: msg, error_message: msg }).eq('id', documentId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}