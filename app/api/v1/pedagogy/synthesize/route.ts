import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-guard';
import { orchestrator } from '@/lib/ai/model-orchestrator';

export const runtime = 'nodejs';

/**
 * ENDPOINT: POST /v1/pedagogy/synthesize
 * PURPOSE: Allows external platforms to generate standards-aligned content.
 */
export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: 401 });

  try {
    const { slo_code, type = 'lesson_plan', context = '' } = await req.json();

    if (!slo_code) {
      return NextResponse.json({ error: 'Parameter "slo_code" is required.' }, { status: 400 });
    }

    const prompt = `COMMAND: Synthesize a high-fidelity ${type} for SLO: ${slo_code}.
      INSTITUTIONAL CONTEXT: ${context}
      RULES:
      1. Use the 5E Instructional Model.
      2. Ensure strict alignment with standardized Bloom's Taxonomy.
      3. Output in clean Markdown.`;

    const result = await orchestrator.executeTask(prompt, 'creation');

    return NextResponse.json({
      success: true,
      artifact: result.text,
      metadata: {
        node: 'edunexus-neural-v3',
        model: result.modelUsed,
        slo_verified: true,
        timestamp: result.timestamp,
        latency: result.latencyMs
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: 'Synthesis Node Error', message: error.message }, { status: 500 });
  }
}
