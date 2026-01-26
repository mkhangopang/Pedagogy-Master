
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { GoogleGenAI } from "@google/genai";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { task, toolType, userInput, brain, priorityDocumentId, message } = body;
    
    // 1. NEURAL VISUAL CONTEXT NODE (Optimized for Throughput)
    if (task === 'generate-visual' || toolType === 'visual-aid') {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const searchPrompt = `As a pedagogical resource architect, find 3-5 direct clickable links to high-quality Creative Commons or free educational images/diagrams for: "${userInput}". 
      
      STRICT CONSTRAINTS:
      - Sources: Pexels, Unsplash, Pixabay, Wikimedia.
      - Output format: Clean list with source titles and direct URLs.
      - For each link, provide a 1-sentence pedagogical justification.
      - Do not generate code. Provide verified web resource nodes.`;

      // Use Flash-3 for search grounding to avoid saturation bottlenecks
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.1,
          topP: 0.95
        }
      });

      const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = grounding.map((c: any) => c.web).filter(Boolean);

      return NextResponse.json({ 
        content: `## 🎨 Pedagogical Visual Resources: ${userInput}\n\n${response.text}\n\n### 🌐 Cloud Verified Sources:\n${sources.map((s: any) => `- [${s.title}](${s.uri})`).join('\n')}\n\n*Synthesis Node: gemini-3-flash | Neural Grid Status: Optimal | Search Active*`
      });
    }

    // 2. STANDARD TEXT SYNTHESIS (Streaming)
    const supabase = getSupabaseServerClient(token);
    let promptText = message || body.message;
    
    if (task === 'generate-tool') {
      promptText = `COMMAND: Generate a high-fidelity ${toolType?.replace('-', ' ')}.\n\n` +
                   `INPUT PARAMETERS: ${userInput}\n\n` +
                   `CRITICAL: Locate relevant Standard or SLO in vault matching this input.`;
    }

    const { text, provider, metadata } = await generateAIResponse(
      promptText, body.history || [], user.id, supabase, body.adaptiveContext, undefined, toolType, brain?.masterPrompt, priorityDocumentId
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        const groundedNote = metadata?.isGrounded ? ` | intelligence anchored to: ${metadata.sourceDocument}` : '';
        const footer = `\n\n---\n*Synthesis Node: ${provider}${groundedNote}*`;
        controller.enqueue(encoder.encode(footer));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [AI ROUTE ERROR]:", error);
    // Return a more descriptive error if it's a rate limit
    const isRateLimit = error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED');
    return NextResponse.json({ 
      error: isRateLimit ? "Neural Grid Saturated" : error.message || "Synthesis grid exception." 
    }, { status: isRateLimit ? 429 : 500 });
  }
}
