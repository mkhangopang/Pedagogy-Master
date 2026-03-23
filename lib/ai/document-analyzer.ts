
import { orchestrator } from "./model-orchestrator";
import { SupabaseClient } from "@supabase/supabase-js";
import { getObjectText } from "../r2";

import { extractJson } from "./utils";

/**
 * NEURAL DOCUMENT INTELLIGENCE (v12.1)
 * Generates rich pedagogical metadata for the Supabase Vault.
 */
export async function analyzeDocumentWithAI(
  documentId: string, 
  userId: string, 
  supabase: SupabaseClient
) {
  try {
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (fetchError || !doc) throw new Error("Document not found");

    let content = doc.extracted_text || "";
    if (!content && doc.file_path) {
      content = await getObjectText(doc.file_path);
    }

    if (!content || content.length < 50) {
      await supabase.from('documents').update({ status: 'ready' }).eq('id', documentId);
      return;
    }

    const prompt = `Perform a world-class pedagogical analysis on this Master MD curriculum file. 
      Generate a structured JSON metadata block for the institutional vault.
      
      RULES:
      1. Return ONLY a valid JSON object.
      2. Follow this schema:
      {
        "metadata": { "title": "string", "subject": "string", "gradeLevels": ["string"], "board": "string", "curriculumYear": "string" },
        "sloIndex": [ { "code": "string", "description": "string", "bloomLevel": "string" } ],
        "summary": "string"
      }
      
      DOCUMENT TEXT:
      ${content.substring(0, 100000)}`;

    const result = await orchestrator.executeTask(prompt, 'strategy');
    const parsedResult = extractJson(result.text || '{}');

    // 1. Update Main Document Record
    await supabase.from('documents').update({
      name: parsedResult.metadata?.title || doc.name,
      subject: parsedResult.metadata?.subject,
      grade_level: parsedResult.metadata?.gradeLevels?.join(', ') || 'Auto',
      authority: parsedResult.metadata?.board || 'Independent',
      version_year: parsedResult.metadata?.curriculumYear || '2024',
      document_summary: parsedResult.summary,
      status: 'ready'
    }).eq('id', documentId);

    // 2. Populate SLO Database for Surgical Grounding
    if (parsedResult.sloIndex && Array.isArray(parsedResult.sloIndex)) {
      const sloRecords = parsedResult.sloIndex.map((s: any) => ({
        document_id: documentId,
        slo_code: s.code,
        slo_full_text: s.description,
        bloom_level: s.bloomLevel || 'Understand',
        created_at: new Date().toISOString()
      }));

      // Scorch previous index if re-processing
      console.log(`[Analyzer] Deleting existing SLOs for document ${documentId}`);
      await supabase.from('slo_database').delete().eq('document_id', documentId);
      
      console.log(`[Analyzer] Inserting ${sloRecords.length} SLO records for document ${documentId}`);
      const { error: insertError } = await supabase.from('slo_database').insert(sloRecords);
      
      if (insertError) {
        console.error(`[Analyzer] Error inserting SLO records:`, insertError);
      } else {
        console.log(`[Analyzer] Successfully inserted SLO records for document ${documentId}`);
      }
    }

  } catch (error) {
    console.error("❌ [Analyzer Fault]:", error);
    await supabase.from('documents').update({ status: 'ready' }).eq('id', documentId);
  }
}
