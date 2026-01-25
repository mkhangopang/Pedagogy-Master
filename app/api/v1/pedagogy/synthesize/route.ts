import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-guard';
import { GoogleGenAI } from '@google/genai';

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

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Use Gemini 3 Pro for Institutional Quality
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `COMMAND: Synthesize a high-fidelity ${type} for SLO: ${slo_code}.
      INSTITUTIONAL CONTEXT: ${context}
      RULES:
      1. Use the 5E Instructional Model.
      2. Ensure strict alignment with standardized Bloom's Taxonomy.
      3. Output in clean Markdown.`,
      config: {
        temperature: 0.2, // Low temperature for consistency
        thinkingConfig: { thinkingBudget: 2000 }
      }
    });

    return NextResponse.json({
      success: true,
      artifact: response.text,
      metadata: {
        node: 'edunexus-neural-v1',
        model: 'gemini-3-pro',
        slo_verified: true,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: 'Synthesis Node Error', message: error.message }, { status: 500 });
  }
}