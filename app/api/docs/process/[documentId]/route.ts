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
 * NEURAL INGESTION ORCHESTRATOR v10.5 (RECOVERY ENABLED)
 * Precise error mapping for infrastructure synchronization issues.
 */
async function callSurgicalLinearizer(content: string, recipe: string, model: string = 'gemini-3-pro-preview'): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: `[SYSTEM_TASK: EXECUTE_IP_EXTRACTION] 
      Apply the Master Recipe to this curriculum data. 
      MANDATORY: You MUST wrap your extraction in <STRUCTURED_INDEX> JSON tags.
      
      INPUT_DATA:
      ${content.substring(0, 100000)}`,
      config: {
        systemInstruction: recipe,
        temperature: 0.1,
        thinkingConfig: model.includes('pro') ? { thinkingBudget: 4096 } : { thinkingBudget: 0 }
      }
    });

    if (!response.text) throw new Error("Empty grid response.");
    return response.text;
  } catch (err: any) {
    if (err.message?.includes('429') || err.status === 429) {
      if (model === 'gemini-3-pro-preview') {
        console.warn(`[Ingestion] Quota hit on Pro. Falling back to Flash node...`);
        return callSurgicalLinearizer(content, recipe, 'gemini-3-flash-preview');
      }
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
    if (!doc) throw new Error("Vault record missing.");

    const { data: brain } = await adminSupabase.from('neural_brain')
      .select('master_prompt')
      .eq('id', 'system-brain')
      .maybeSingle();
    
    const masterRecipe = brain?.master_prompt || DEFAULT_MASTER_PROMPT;

    if (job.step === IngestionStep.EXTRACT) {
      await adminSupabase.from('documents').update({ document_summary: 'Decoding curriculum bits...' }).eq('id', documentId);
      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error("R2_NODE_ERROR: Physical asset unreachable.");
      
      const rawResult = await pdf(buffer);
      if (!rawResult.text || rawResult.text.trim().length < 20) {
        throw new Error("Extraction failure: Document empty or unreadable image.");
      }

      await adminSupabase.from('documents').update({ 
        extracted_text: rawResult.text.trim(),
        document_summary: 'Linearizing domains...' 
      }).eq('id', documentId);
      
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.LINEARIZE }).eq('id', job.id);
      job.step = IngestionStep.LINEARIZE;
    }

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
              slo_code: s.code || s.slo_code,
              slo_full_text: s.text || s.slo_full_text,
              bloom_level: s.bloomLevel || 'Understand'
            }));
            
            const { error: delErr } = await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
            if (delErr) throw new Error(`DB_ERROR: slo_database cleanup failed - ${delErr.message}`);
            
            const { error: insErr } = await adminSupabase.from('slo_database').insert(sloRecords);
            if (insErr) throw new Error(`DB_ERROR: slo_database insertion failed - ${insErr.message}`);
          }
        } catch (e: any) {
          if (e.message.includes('DB_ERROR')) throw e;
          console.error("❌ JSON Extraction Failure:", e.message);
        }
      }

      await adminSupabase.from('documents').update({ extracted_text: processedMarkdown }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.EMBED }).eq('id', job.id);
      job.step = IngestionStep.EMBED;
    }

    if (job.step === IngestionStep.EMBED) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      
      try {
        await indexDocumentForRAG(documentId, currentDoc?.extracted_text || "", adminSupabase, job.id);
      } catch (ragErr: any) {
        if (ragErr.message?.includes('token_count') || ragErr.message?.includes('column')) {
           throw new Error(`SCHEMA_FAULT: Column 'token_count' missing in database. Please run the SQL v8.0 script in the Brain Control panel.`);
        }
        throw ragErr;
      }

      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.FINALIZE, status: JobStatus.COMPLETED }).eq('id', job.id);
      await adminSupabase.from('documents').update({ status: 'ready', rag_indexed: true, document_summary: 'Neural alignment verified.' }).eq('id', documentId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Orchestrator Fault:", error.message);
    
    let detailedMsg = error.message || "Unknown Neural Bottleneck";
    
    if (detailedMsg.includes('token_count') || detailedMsg.includes('schema cache') || detailedMsg.includes('slo_database') || detailedMsg.includes('relation') || detailedMsg.includes('SCHEMA_FAULT')) {
      detailedMsg = `Grid Fault: ${detailedMsg}. IMPORTANT: Go to 'Brain Control' > 'Blueprint', Copy the SQL v8.0 and Run it in Supabase to fix this.`;
    }

    await adminSupabase.from('ingestion_jobs').update({ status: JobStatus.FAILED, error_message: detailedMsg }).eq('id', job?.id);
    await adminSupabase.from('documents').update({ status: 'failed', document_summary: detailedMsg, error_message: detailedMsg }).eq('id', documentId);
    
    return NextResponse.json({ error: detailedMsg }, { status: 500 });
  }
}