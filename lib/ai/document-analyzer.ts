import { GoogleGenAI, Type } from "@google/genai";
import { SupabaseClient } from "@supabase/supabase-js";
import { getObjectText } from "../r2";

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

    if (!content || content.length < 10) {
      await supabase.from('documents').update({ status: 'ready' }).eq('id', documentId);
      return;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Perform a deep pedagogical analysis on this curriculum file. Identify the SUBJECT and GRADE with 100% accuracy.
      
      DOCUMENT TEXT:
      ${content.substring(0, 100000)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            subject: { type: Type.STRING, description: "The primary academic subject (e.g. English, Biology, Math)" },
            grade: { type: Type.STRING },
            difficultyLevel: { type: Type.STRING, enum: ["elementary", "middle_school", "high_school", "college"] },
            slos: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  code: { type: Type.STRING },
                  fullText: { type: Type.STRING },
                  bloomLevel: { type: Type.STRING }
                },
                required: ["code", "fullText", "bloomLevel"]
              }
            }
          },
          required: ["summary", "subject", "grade", "slos"]
        }
      }
    });

    const analysis = JSON.parse(response.text || '{}');

    await supabase.from('documents').update({
      document_summary: analysis.summary,
      subject: analysis.subject,
      grade_level: analysis.grade,
      difficulty_level: analysis.difficultyLevel,
      gemini_processed: true
    }).eq('id', documentId);

    if (analysis.slos?.length > 0) {
      const sloRecords = analysis.slos.map((s: any) => ({
        document_id: documentId,
        slo_code: s.code,
        slo_full_text: s.fullText,
        subject: analysis.subject,
        grade_level: analysis.grade,
        bloom_level: s.bloomLevel
      }));

      await supabase.from('slo_database').upsert(sloRecords, {
        onConflict: 'document_id, slo_code'
      });
    }

    return analysis;
  } catch (error) {
    console.error("Deep Analysis Failed:", error);
    await supabase.from('documents').update({ status: 'ready' }).eq('id', documentId);
  }
}