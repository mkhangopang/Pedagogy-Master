import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep, JobStatus } from '../../../../../types';
import { neuralGrid } from '../../../../../lib/ai/model-orchestrator';
import { DEFAULT_MASTER_PROMPT } from '../../../../../constants';
import { IngestionQueue } from '../../../../../lib/jobs/ingestion-queue';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * ORCHESTRATED INGESTION ENGINE v14.0
 * Uses multi-provider failover to prevent "Sync Protocol Interrupted" errors.
 */
async function callLinearizer(content: string, recipe: string): Promise<string> {
  const synth = getSynthesizer();
  
  const result = await synth.synthesize(`[TASK: LINEARIZE_CURRICULUM] 
    Apply the Master Recipe to this curriculum data. 
    MANDATORY: Wrap extracted SLOs in <STRUCTURED_INDEX> JSON tags.
    
    DATA:
    ${content.substring(0, 100000)}`, {
    systemPrompt: recipe,
    complexity: 3 // Forces Tier-1 Reasoning (Gemini Pro, DeepSeek R1, or Grok 2)
  });

  return result.text || "";
}

export async function POST(req: NextRequest, props: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await props.params;
  const adminSupabase = getSupabaseAdminClient();
  const queue = new IngestionQueue(adminSupabase);

  let job = await queue.getJobStatus(documentId);

  if (!job) {
    const jobId = await queue.enqueue(documentId);
    job = { id: jobId, step: IngestionStep.EXTRACT };
  }

  try {
    const { data: doc } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error("VAULT_ERROR: Node missing.");

    const { data: brain } = await adminSupabase.from('neural_brain').select('master_prompt').eq('id', 'system-brain').maybeSingle();
    const recipe = brain?.master_prompt || DEFAULT_MASTER_PROMPT;

    // STEP 1: BINARY EXTRACTION
    if (job.step === IngestionStep.EXTRACT) {
      await queue.updateProgress(job.id, { step: IngestionStep.EXTRACT, progress: 10, message: 'Neural extraction...' });
      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error("R2_FAULT: Object unreachable.");
      const raw = await pdf(buffer);
      await adminSupabase.from('documents').update({ extracted_text: raw.text.trim() }).eq('id', documentId);
      await queue.updateProgress(job.id, { step: IngestionStep.LINEARIZE, progress: 25, message: 'Linearization...' });
      job.step = IngestionStep.LINEARIZE;
    }

    // STEP 2: PEDAGOGICAL LINEARIZATION
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
      await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 60, message: 'Vector indexing...' });
      job.step = IngestionStep.EMBED;
    }

    // STEP 3: VECTOR MAPPING & FINALIZATION
    if (job.step === IngestionStep.EMBED) {
      const { data: finalDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      await indexDocumentForRAG(documentId, finalDoc?.extracted_text || "", adminSupabase, job.id);
      
      const { data: chunks } = await adminSupabase.from('document_chunks').select('id, slo_codes').eq('document_id', documentId);
      const { data: slos } = await adminSupabase.from('slo_database').select('id, slo_code').eq('document_id', documentId);
      
      if (chunks && slos) {
        const mappings: any[] = [];
        const sloCodeToId = Object.fromEntries(slos.map(s => [s.slo_code, s.id]));
        chunks.forEach(chunk => {
          (chunk.slo_codes || []).forEach((code: string) => {
            if (sloCodeToId[code]) mappings.push({ chunk_id: chunk.id, slo_id: sloCodeToId[code], slo_code: code });
          });
        });
        if (mappings.length > 0) await adminSupabase.from('chunk_slo_mapping').insert(mappings);
      }

      await queue.markComplete(job.id);
      await adminSupabase.from('documents').update({ status: 'ready', rag_indexed: true, document_summary: 'Neural grid verified.' }).eq('id', documentId);
      await adminSupabase.rpc('reload_schema_cache');
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    const msg = err.message || "Synthesis grid exception.";
    await queue.markFailed(job.id, msg);
    await adminSupabase.from('documents').update({ status: 'failed', document_summary: msg }).eq('id', documentId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
