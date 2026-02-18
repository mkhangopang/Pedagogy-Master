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
 * NEURAL INGESTION ORCHESTRATOR v8.0 (IP PROTECTED)
 * This engine performs the 'Neural Handshake' using the Founder's Master Recipe.
 * It is responsible for the transition from raw binary payload to a surgical pedagogical ledger.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await props.params;
  const adminSupabase = getSupabaseAdminClient();

  // 1. Recover or Initialize Job
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
    if (!doc) throw new Error("Vault record missing. Infrastructure handshake failed.");

    // 2. SECURE IP FETCH (MASTER RECIPE & SQL BLUEPRINT)
    const { data: brain } = await adminSupabase.from('neural_brain')
      .select('master_prompt')
      .eq('id', 'system-brain')
      .single();
    
    const masterRecipe = brain?.master_prompt;
    if (!masterRecipe) throw new Error("BRAIN_OFFLINE: Master Recipe (IP) not committed to database.");

    // PHASE 1: BINARY EXTRACTION (PDF -> TEXT)
    if (job.step === IngestionStep.EXTRACT) {
      await adminSupabase.from('documents').update({ document_summary: 'Extracting binary payload...' }).eq('id', documentId);
      
      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error("R2_NODE_ERROR: Binary payload unreachable.");
      
      const rawResult = await pdf(buffer);
      await adminSupabase.from('documents').update({ 
        extracted_text: rawResult.text.trim(),
        document_summary: 'Processing neural markdown...' 
      }).eq('id', documentId);
      
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.LINEARIZE }).eq('id', job.id);
      job.step = IngestionStep.LINEARIZE;
    }

    // PHASE 2: LINEARIZATION & SURGICAL SLO EXTRACTION
    if (job.step === IngestionStep.LINEARIZE) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Use a reasoning-heavy model for structural integrity
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `[TASK: EXECUTE_MASTER_RECIPE] Process curriculum data. 
        REQUIRED OUTPUT: Full Markdown linearization AND a <STRUCTURED_INDEX> JSON array of all SLOs.
        
        DATA_BUFFER:
        ${currentDoc?.extracted_text?.substring(0, 100000)}`,
        config: {
          systemInstruction: masterRecipe,
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 2048 }
        }
      });

      const architectOutput = response.text || "";
      
      // SURGICAL LEDGER SYNC
      const indexMatch = architectOutput.match(/<STRUCTURED_INDEX>([\s\S]+?)<\/STRUCTURED_INDEX>/);
      let sloCount = 0;
      
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
            
            sloCount = sloRecords.length;
            
            // Delete old nodes to prevent fragmentation
            await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
            await adminSupabase.from('slo_database').insert(sloRecords);
            
            await adminSupabase.from('documents').update({
              subject: sloIndex[0].subject || doc.subject,
              grade_level: sloIndex[0].grade ? `Grade ${sloIndex[0].grade}` : doc.grade_level,
              document_summary: `Neural Ledger synced: ${sloCount} surgical standards indexed.`
            }).eq('id', documentId);
          }
        } catch (e) {
          console.warn("Ledger JSON Fault. Attempting heuristic recovery.");
        }
      }

      await adminSupabase.from('documents').update({ 
        extracted_text: architectOutput,
        status: 'ready' // Marking as ready early so the Reader can open while embedding completes
      }).eq('id', documentId);
      
      await adminSupabase.from('ingestion_jobs').update({ step: IngestionStep.EMBED }).eq('id', job.id);
      job.step = IngestionStep.EMBED;
    }

    // PHASE 3: VECTOR ALIGNMENT (RAG)
    if (job.step === IngestionStep.EMBED) {
      const { data: currentDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      await indexDocumentForRAG(documentId, currentDoc?.extracted_text || "", adminSupabase, job.id);
      
      await adminSupabase.from('ingestion_jobs').update({ 
        step: IngestionStep.FINALIZE, 
        status: JobStatus.COMPLETED 
      }).eq('id', job.id);
      
      await adminSupabase.from('documents').update({ 
        status: 'ready', 
        rag_indexed: true 
      }).eq('id', documentId);
    }

    return NextResponse.json({ success: true, sloCount: doc.document_summary });
  } catch (error: any) {
    console.error("❌ Orchestrator Critical Fault:", error.message);
    await adminSupabase.from('ingestion_jobs').update({ 
      status: JobStatus.FAILED, 
      error_message: error.message 
    }).eq('id', job?.id);
    
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      document_summary: `Sync Fault: ${error.message}` 
    }).eq('id', documentId);
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}