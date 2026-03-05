import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { IngestionStep, JobStatus } from '../../../../../types';
import { getSynthesizer } from '../../../../../lib/ai/synthesizer-core';
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
      await queue.updateProgress(job.id, { step: IngestionStep.PARSE, progress: 25, message: 'Deterministic parsing...' });
      job.step = IngestionStep.PARSE;
    }

    // STEP 2: DETERMINISTIC PARSING
    if (job.step === IngestionStep.PARSE) {
      const { data: current } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      const text = current?.extracted_text || "";
      
      // Stage 2: Regex state-machine per chunk (simplified for now)
      const sloRegex = /([A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+)\s+([\s\S]+?)(?=[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+|$)/g;
      const matches = [...text.matchAll(sloRegex)];
      
      if (matches.length > 0) {
        const records = matches.map(m => ({
          document_id: documentId,
          slo_code: m[1].trim(),
          slo_full_text: m[2].trim(),
          bloom_level: 'Understand'
        }));
        await adminSupabase.from('slo_database').delete().eq('document_id', documentId);
        await adminSupabase.from('slo_database').insert(records);
      }

      await queue.updateProgress(job.id, { step: IngestionStep.ENRICH, progress: 45, message: 'Pedagogical enrichment...' });
      job.step = IngestionStep.ENRICH;
    }

    // STEP 3: PEDAGOGICAL ENRICHMENT
    if (job.step === IngestionStep.ENRICH) {
      const { data: slos } = await adminSupabase.from('slo_database').select('*').eq('document_id', documentId);
      
      if (slos && slos.length > 0) {
        // Batch 15 SLOs at a time
        for (let i = 0; i < slos.length; i += 15) {
          const batch = slos.slice(i, i + 15);
          const prompt = `Assign Bloom's Taxonomy levels to these SLOs:\n${batch.map(s => `${s.slo_code}: ${s.slo_full_text}`).join('\n')}`;
          const enrichment = await callLinearizer(prompt, "You are a Bloom's Taxonomy expert. Return JSON mapping code to level.");
          
          try {
            const mapping = JSON.parse(enrichment.match(/\{[\s\S]*\}/)?.[0] || '{}');
            for (const s of batch) {
              if (mapping[s.slo_code]) {
                await adminSupabase.from('slo_database').update({ bloom_level: mapping[s.slo_code] }).eq('id', s.id);
              }
            }
          } catch (e) { console.error("Enrichment batch failure", e); }
        }
      }

      await queue.updateProgress(job.id, { step: IngestionStep.EMBED, progress: 70, message: 'Vector mapping...' });
      job.step = IngestionStep.EMBED;
    }

    // STEP 4: VECTOR MAPPING & FINALIZATION
    if (job.step === IngestionStep.EMBED) {
      const { data: finalDoc } = await adminSupabase.from('documents').select('extracted_text').eq('id', documentId).single();
      await indexDocumentForRAG(documentId, finalDoc?.extracted_text || "", adminSupabase, job.id);
      
      await queue.updateProgress(job.id, { step: IngestionStep.COMPLETE, progress: 95, message: 'Finalizing node...' });
      job.step = IngestionStep.COMPLETE;
    }

    // STEP 5: COMPLETE
    if (job.step === IngestionStep.COMPLETE) {
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
