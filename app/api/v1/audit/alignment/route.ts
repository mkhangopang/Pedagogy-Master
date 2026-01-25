import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-guard';
import { GoogleGenAI, Type } from '@google/genai';

export const runtime = 'nodejs';

/**
 * ENDPOINT: POST /v1/audit/alignment
 * PURPOSE: Validates external content against standardized curriculum.
 * USE CASE: Noon Academy checks if their teacher's video matches Sindh Board SLO S08C03.
 */
export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    const { content_transcript, target_slo } = await req.json();

    if (!content_transcript || !target_slo) {
      return NextResponse.json({ error: 'Fields "content_transcript" and "target_slo" are required.' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `AUDIT TASK: Compare the following CONTENT TRANSCRIPT against the pedagogical requirements of SLO: ${target_slo}.
      
      TRANSCRIPT:
      ${content_transcript.substring(0, 10000)}
      
      Evaluate accuracy, depth, and alignment.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            alignment_score: { type: Type.NUMBER, description: "0 to 100 percentage" },
            matching_clauses: { type: Type.ARRAY, items: { type: Type.STRING } },
            missing_concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
            pedagogical_critique: { type: Type.STRING },
            status: { type: Type.STRING, enum: ["ALIGNED", "PARTIAL", "NON_COMPLIANT"] }
          },
          required: ["alignment_score", "status", "pedagogical_critique"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json({ error: 'Neural engine failed to produce a valid response.' }, { status: 500 });
    }

    return NextResponse.json(JSON.parse(text));

  } catch (error: any) {
    return NextResponse.json({ error: 'Audit Engine Failure', message: error.message }, { status: 500 });
  }
}