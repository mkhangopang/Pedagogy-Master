
import { GoogleGenAI, Type } from "@google/genai";
import { SupabaseClient } from "@supabase/supabase-js";
import { getObjectText } from "../r2";

export interface GeminiProcessedDocument {
  documentId: string;
  summary: string;
  keyTopics: string[];
  difficultyLevel: string;
  extractedSLOs: any[];
  documentStructure: any;
  qualityScore: number;
}

/**
 * Deep Analysis Engine
 * Extracts high-fidelity pedagogical intelligence from raw curriculum text using Gemini 3.
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

    let content = "";
    if (doc.extracted_text_r2_key) {
      content = await getObjectText(doc.extracted_text_r2_key);
    } else if (doc.r2_key) {
      content = await getObjectText(doc.r2_key);
    } else if (doc.extracted_text) {
      content = doc.extracted_text;
    }

    if (!content || content.length < 10) {
      await supabase.from('documents').update({ status: 'completed' }).eq('id', documentId);
      return;
    }

    // Fix: Initialize with process.env.API_KEY using the required named parameter object.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a curriculum document intelligence system. Analyze this curriculum document and extract ALL structured information.
      
      DOCUMENT TEXT:
      ${content.substring(0, 30000)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            keyTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
            difficultyLevel: { type: Type.STRING, enum: ["elementary", "middle_school", "high_school", "college"] },
            subject: { type: Type.STRING },
            grade: { type: Type.STRING },
            board: { type: Type.STRING },
            slos: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  code: { type: Type.STRING },
                  fullText: { type: Type.STRING },
                  bloomLevel: { type: Type.STRING },
                  cognitiveComplexity: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
                  teachingStrategies: { type: Type.ARRAY, items: { type: Type.STRING } },
                  assessmentIdeas: { type: Type.ARRAY, items: { type: Type.STRING } },
                  prerequisiteConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                  commonMisconceptions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  pageNumber: { type: Type.NUMBER },
                  confidence: { type: Type.NUMBER }
                },
                required: ["code", "fullText", "bloomLevel"]
              }
            },
            documentStructure: {
              type: Type.OBJECT,
              properties: {
                hasTOC: { type: Type.BOOLEAN },
                sections: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      pageStart: { type: Type.NUMBER }
                    }
                  }
                },
                totalPages: { type: Type.NUMBER },
                hasAppendix: { type: Type.BOOLEAN }
              }
            }
          },
          required: ["summary", "difficultyLevel", "slos"]
        }
      }
    });

    let analysis: any = { summary: "Analysis failed", difficultyLevel: "middle_school", slos: [] };
    // Access .text property directly as per SDK guidelines.
    const text = response.text || '{}';
    try {
      analysis = JSON.parse(text);
    } catch (parseErr) {
      console.error("JSON Parse Error:", parseErr);
    }

    const calculateQualityScore = (data: any) => {
      let score = 0;
      if (data.summary?.length > 50) score += 20;
      if (data.slos?.length > 0) score += 30;
      const slosWithStrategies = data.slos?.filter((s: any) => s.teachingStrategies?.length > 0).length || 0;
      score += (slosWithStrategies / Math.max(data.slos?.length || 1, 1)) * 30;
      if (data.keyTopics?.length >= 5) score += 10;
      if (data.documentStructure?.sections?.length > 0) score += 10;
      return Math.min(score, 100) / 100;
    };

    const qualityScore = calculateQualityScore(analysis);

    await supabase.from('documents').update({
      status: 'completed',
      document_summary: analysis.summary,
      difficulty_level: analysis.difficultyLevel,
      subject: analysis.subject || doc.subject,
      grade_level: analysis.grade || doc.grade_level,
      gemini_metadata: {
        quality_score: qualityScore,
        document_structure: analysis.documentStructure,
        key_topics: analysis.keyTopics,
        board: analysis.board
      }
    }).eq('id', documentId);

    if (analysis.slos && analysis.slos.length > 0) {
      const sloRecords = analysis.slos.map((s: any) => ({
        document_id: documentId,
        slo_code: s.code,
        slo_full_text: s.fullText,
        subject: analysis.subject || doc.subject,
        grade_level: analysis.grade || doc.grade_level,
        bloom_level: s.bloomLevel,
        cognitive_complexity: s.cognitiveComplexity,
        teaching_strategies: s.teachingStrategies || [],
        assessment_ideas: s.assessmentIdeas || [],
        prerequisite_concepts: s.prerequisiteConcepts || [],
        common_misconceptions: s.commonMisconceptions || [],
        keywords: s.keywords || [],
        page_number: s.pageNumber,
        extraction_confidence: s.confidence || 0.95
      }));

      const { error: sloError } = await supabase.from('slo_database').upsert(sloRecords, {
        onConflict: 'document_id, slo_code'
      });
      
      if (sloError) console.error("SLO Upsert Error:", sloError);
    }

    return analysis;
  } catch (error) {
    console.error("Pedagogical Analysis Failed:", error);
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentId);
  }
}
