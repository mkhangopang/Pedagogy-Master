
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { callGemini } from '../../../lib/ai/providers/gemini';
import { synthesize } from '../../../lib/ai/synthesizer-core';
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
    
    // 1. NEURAL VISUAL CONTEXT NODE (Deep Resource Grounding)
    if (task === 'generate-visual' || toolType === 'visual-aid') {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const searchPrompt = `SYSTEM COMMAND: Locate high-fidelity educational visuals for the pedagogical context: "${userInput}".
      
      STRICT REQUIREMENTS:
      1. Source ONLY from Creative Commons or free-to-use platforms: Pexels, Unsplash, Pixabay, or Wikimedia Commons.
      2. Provide 3-5 verified direct URLs to images, diagrams, or archival media.
      3. For each link, explain EXACTLY how it supports the Student Learning Objective (SLO).
      4. Format as a clean instructional resource list.
      5. Include a brief "Teacher's Guide" note on utilizing these visuals in a slide deck or classroom activity.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 1500 }
        }
      });

      const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = grounding.map((c: any) => c.web).filter(Boolean);

      return NextResponse.json({ 
        content: `## 🎨 Visual Context: ${userInput}\n\n${response.text}\n\n### 🌐 Source Nodes Verified:\n${sources.map((s: any) => `- [${s.title}](${s.uri})`).join('\n')}\n\n*Synthesis Node: gemini-3-pro | Visual Context Engine v2.1 (Live Search)*`
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
    return NextResponse.json({ error: error.message || "Synthesis grid exception." }, { status: 500 });
  }
}
