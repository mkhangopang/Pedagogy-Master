import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks, RetrievedChunk } from '../../../lib/rag/retriever';
import { GoogleGenAI } from '@google/genai';
import { DEFAULT_MASTER_PROMPT, NUCLEAR_GROUNDING_DIRECTIVE } from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * NEURAL BRAIN CHAT ENGINE (v3.5)
 * FEATURE: ELASTIC SINDH CURRICULUM RESEARCH
 * 
 * Logic:
 * 1. Scans query for curriculum codes (SLOs).
 * 2. Checks user's personal PDF library (RAG).
 * 3. IF missing OR sparse: Activates Google Search Tool focused on Sindh/DCAR portals.
 * 4. Synthesizes final pedagogical response using Sindh Board standards.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { message, priorityDocumentId } = body;

    const supabase = getSupabaseServerClient(token);

    // 1. Load active Neural Logic (Master Prompt)
    const { data: brainData } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const activeMasterPrompt = brainData?.master_prompt || DEFAULT_MASTER_PROMPT;

    // 2. SLO Intelligence: Detection
    const sloRegex = /\b([A-Z]\d{1,2}[a-z]\d{1,2}|[A-Z]-\d{1,2}-\d{1,2}|\d\.\d\.\d)\b/gi;
    const detectedSLOs = message.match(sloRegex);
    const targetSLO = detectedSLOs?.[0];

    // 3. Local Neural Grid Search (PDF Library)
    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_selected', true);
    
    let documentIds = selectedDocs?.map(d => d.id) || [];
    
    let localChunks: RetrievedChunk[] = [];
    if (documentIds.length > 0) {
      localChunks = await retrieveRelevantChunks(message, documentIds, supabase, 10, priorityDocumentId);
    }

    // 4. Elastic Decision Matrix
    // Scrape if SLO is present but local PDF results are insufficient
    const isLocalSparse = localChunks.length === 0 || (localChunks.length > 0 && localChunks[0].similarity < 0.28);
    const shouldScrapeWeb = targetSLO && isLocalSparse;
    const hasLocalGrounding = localChunks.length > 0;

    // 5. Initialize Gemini 3 Synthesis Grid
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    let systemInstruction = `${activeMasterPrompt}\n\n`;
    
    if (shouldScrapeWeb) {
      systemInstruction += `SINDH_CURRICULUM_RESEARCH_PROTOCOL: 
      1. Objective [${targetSLO}] not found in user's PDF library.
      2. USE GOOGLE_SEARCH to fetch official definition.
      3. PRIMARY SOURCE: https://dcar.gos.pk/Sindh%20Curriculum.html (Directorate of Curriculum, Assessment and Research - Sindh).
      4. SECONDARY SOURCES: stbb.gos.pk (Sindh Textbook Board), ncc.gov.pk.
      5. Extract the exact Student Learning Outcome text.
      6. CITE the source URL in your response.`;
    } else if (hasLocalGrounding) {
      systemInstruction += `${NUCLEAR_GROUNDING_DIRECTIVE}\nSTRICT_LOCAL_GROUNDING: Local PDF content detected. Priority given to uploaded assets.`;
    }

    const contextVault = localChunks.map((c, i) => `[PDF_ASSET_NODE_${i+1}] ${c.text}`).join('\n\n');
    
    const synthesisPrompt = shouldScrapeWeb 
      ? `TEACHER_QUERY: "${message}"\nRESEARCH_TASK: Scrape official Sindh Curriculum definition for SLO ${targetSLO} and generate pedagogical response.`
      : hasLocalGrounding 
        ? `<MEMORY_VAULT>\n${contextVault}\n</MEMORY_VAULT>\n\nTEACHER_QUERY: "${message}"`
        : message;

    // Execute Synthesis with Search Tool
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
      config: {
        systemInstruction,
        temperature: hasLocalGrounding ? 0.05 : 0.6,
        tools: shouldScrapeWeb ? [{ googleSearch: {} }] : []
      }
    });

    const responseText = result.text || "Synthesis Error: Node connection timed out.";
    
    // Harvest Grounding metadata
    const webSources = result.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sourceLinks = webSources
      .filter((chunk: any) => chunk.web)
      .map((chunk: any) => `* [${chunk.web.title}](${chunk.web.uri})`)
      .join('\n');

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        if (shouldScrapeWeb) {
          controller.enqueue(encoder.encode(`> *Neural Research Mode: SLO ${targetSLO} missing from library. Fetching from Sindh Curriculum Portal (DCAR)...*\n\n`));
        } else if (hasLocalGrounding) {
          controller.enqueue(encoder.encode(`> *Neural Sync Mode: Grounded in your uploaded PDF library assets.*\n\n`));
        }

        controller.enqueue(encoder.encode(responseText));

        if (sourceLinks) {
          controller.enqueue(encoder.encode(`\n\n### Official Sindh Curriculum Sources:\n${sourceLinks}`));
        }
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error('❌ [Synthesis Fatal]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}