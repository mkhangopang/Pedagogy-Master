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
 * NEURAL INGESTION ORCHESTRATOR v9.8 (RESILIENT)
 * Enhanced with Surgical Diagnostics to catch stale schema caches.
 */
async function callSurgicalLinearizer(content: string, recipe: string, model: string = 'gemini-3-pro-preview'): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: `[SYSTEM_TASK: EXECUTE_IP_EXTRACTION] 
      Apply the Master Recipe to this curriculum data. 
      MANDATORY: Output valid Markdown AND the <STRUCTURED_INDEX> JSON block.
      
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
          const sloIndex = JSON.parse(indexMatch[1].trim());
          if (Array.isArray(sloIndex)) {
            const sloRecords = sloIndex.map((s: any) => ({
              document_id: documentId,
              slo_code: s.code || s.slo_code,
              slo_full_text: s.text || s.slo_full_text,
              bloom_level: s.bloomLevel || 'Understand'
            }));
            await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
            await adminSupabase.from('slo_database').insert(sloRecords);
          }
        } catch (e) {}
      }

      await adminSupabase.from('documents').update({ extracted_text: processedMarkdown }).eq('id', documentId);
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.EMBED }).eq('id', job.id);
      job.step = IngestionStep.EMBED;
    }

    if (job.step === IngestionStep.EMBED) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      
      // THIS STEP OFTEN FAILS IF 'semantic_fingerprint' IS MISSING IN DB CACHE
      await indexDocumentForRAG(documentId, currentDoc?.extracted_text || "", adminSupabase, job.id);
      
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.FINALIZE, status: JobStatus.COMPLETED }).eq('id', job.id);
      await adminSupabase.from('documents').update({ status: 'ready', rag_indexed: true, document_summary: 'Neural alignment verified.' }).eq('id', documentId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Orchestrator Fault:", error.message);
    
    let detailedMsg = error.message || "Unknown Neural Bottleneck";
    
    // Detect the specific "Column not found" error that requires a cache reload
    if (detailedMsg.includes('semantic_fingerprint') || detailedMsg.includes('cache')) {
      detailedMsg = "Infrastructure Desync: Schema cache is stale. Go to 'Brain Control' and click 'Re-Sync Grid' to repair.";
    }

    await adminSupabase.from('ingestion_jobs').update({ status: JobStatus.FAILED, error_message: detailedMsg }).eq('id', job?.id);
    await adminSupabase.from('documents').update({ status: 'failed', document_summary: detailedMsg, error_message: detailedMsg }).eq('id', documentId);
    
    return NextResponse.json({ error: detailedMsg }, { status: 500 });
  }
}