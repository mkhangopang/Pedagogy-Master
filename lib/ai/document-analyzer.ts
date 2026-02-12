
import { GoogleGenAI, Type } from "@google/genai";
import { SupabaseClient } from "@supabase/supabase-js";
import { getObjectText } from "../r2";

/**
 * NEURAL DOCUMENT INTELLIGENCE (v12.0)
 * Generates rich pedagogical metadata for the Supabase Vault.
 */
export async function analyzeDocumentWithAI(
  documentId: string, 
  userId: string, 
  supabase: SupabaseClient
) {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("Neural Node Error: API Key missing.");

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

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Perform a world-class pedagogical analysis on this Master MD curriculum file. 
      Generate a structured JSON metadata block for the institutional vault.
      
      DOCUMENT TEXT:
      ${content.substring(0, 100000)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            metadata: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                subject: { type: Type.STRING },
                gradeLevels: { type: Type.ARRAY, items: { type: Type.STRING } },
                board: { type: Type.STRING },
                curriculumYear: { type: Type.STRING }
              },
              required: ["title", "subject", "gradeLevels"]
            },
            sloIndex: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  code: { type: Type.STRING },
                  description: { type: Type.STRING },
                  bloomLevel: { type: Type.STRING, description: "Remember, Understand, Apply, Analyze, Evaluate, Create" }
                },
                required: ["code", "description"]
              }
            },
            summary: { type: Type.STRING }
          },
          required: ["metadata", "sloIndex", "summary"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');

    // 1. Update Main Document Record
    await supabase.from('documents').update({
      name: result.metadata.title || doc.name,
      subject: result.metadata.subject,
      grade_level: result.metadata.gradeLevels?.join(', ') || 'Auto',
      authority: result.metadata.board || 'Independent',
      version_year: result.metadata.curriculumYear || '2024',
      document_summary: result.summary,
      status: 'ready'
    }).eq('id', documentId);

    // 2. Populate SLO Database for Surgical Grounding
    if (result.sloIndex && Array.isArray(result.sloIndex)) {
      const sloRecords = result.sloIndex.map((s: any) => ({
        document_id: documentId,
        slo_code: s.code,
        slo_full_text: s.description,
        bloom_level: s.bloomLevel || 'Understand',
        created_at: new Date().toISOString()
      }));

      // Scorch previous index if re-processing
      await supabase.from('slo_database').delete().eq('document_id', documentId);
      await supabase.from('slo_database').insert(sloRecords);
    }

  } catch (error) {
    console.error("❌ [Analyzer Fault]:", error);
    await supabase.from('documents').update({ status: 'ready' }).eq('id', documentId);
  }
}
