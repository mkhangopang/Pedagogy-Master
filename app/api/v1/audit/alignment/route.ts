import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-guard';
import { orchestrator } from '@/lib/ai/model-orchestrator';

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

    const prompt = `AUDIT TASK: Compare the following CONTENT TRANSCRIPT against the pedagogical requirements of SLO: ${target_slo}.
      
      TRANSCRIPT:
      ${content_transcript.substring(0, 10000)}
      
      Evaluate accuracy, depth, and alignment.
      
      Return ONLY a JSON object with this schema:
      {
        "alignment_score": number,
        "matching_clauses": ["string"],
        "missing_concepts": ["string"],
        "pedagogical_critique": "string",
        "status": "ALIGNED" | "PARTIAL" | "NON_COMPLIANT"
      }`;

    const result = await orchestrator.executeTask(prompt, 'strategy');
    const responseText = result.text;
    
    if (!responseText) {
      return NextResponse.json({ error: 'Neural engine failed to produce a valid response.' }, { status: 500 });
    }

    // Clean potential markdown formatting
    const cleanJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
    return NextResponse.json(JSON.parse(cleanJson));

  } catch (error: any) {
    return NextResponse.json({ error: 'Audit Engine Failure', message: error.message }, { status: 500 });
  }
}