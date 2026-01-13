
import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { GoogleGenAI } from '@google/genai';
import { retrieveHybridContext } from '../../../lib/rag/hybrid-retriever';
import { DEFAULT_MASTER_PROMPT, NUCLEAR_GROUNDING_DIRECTIVE } from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * NEURAL BRAIN CHAT ENGINE (v4.0)
 * INTEGRATED SINDH PORTAL SCRAPER + RAG
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

    // 1. Setup Brain Logic
    const { data: brainData } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const activeMasterPrompt = brainData?.master_prompt || DEFAULT_MASTER_PROMPT;

    // 2. SLO Intelligence
    const sloRegex = /\b([A-Z]\d{1,2}[a-z]\d{1,2}|[A-Z]-\d{1,2}-\d{1,2}|\d\.\d\.\d)\b/gi;
    const targetSLO = message.match(sloRegex)?.[0];

    // 3. Document Filter
    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_selected', true);
    
    const documentIds = selectedDocs?.map(d => d.id) || [];

    // 4. Execute Hybrid Retrieval (Local PDF + Web Scrape)
    const context = await retrieveHybridContext(message, documentIds, supabase, targetSLO);

    // 5. Build Neural Prompt
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    let systemInstruction = `${activeMasterPrompt}\n\n`;
    
    // Inject Grounding Directives
    if (context.groundingSource === 'local' || context.groundingSource === 'mixed') {
      systemInstruction += `${NUCLEAR_GROUNDING_DIRECTIVE}\nVAULT_PRIORITY: Local documents are primary.`;
    }
    
    if (context.webScrape) {
      systemInstruction += `\nWEB_SCRAPE_DIRECTIVE: I have scraped the Sindh Curriculum portal for live data. Use the [SINDH_PORTAL_CONTEXT] below to align with Sindh Board standards.`;
    }

    // Assemble Memory Vault
    let memoryVault = '';
    
    if (context.localChunks.length > 0) {
      memoryVault += `# <LOCAL_PDF_VAULT>\n` + context.localChunks.map((c, i) => `[PDF_NODE_${i+1}] ${c.text}`).join('\n\n') + `\n\n`;
    }
    
    if (context.webScrape) {
      memoryVault += `# <SINDH_PORTAL_CONTEXT>\nSOURCE: ${context.webScrape.url}\nTITLE: ${context.webScrape.title}\nCONTENT: ${context.webScrape.text}\n\n`;
    }

    const synthesisPrompt = `${memoryVault}\n\nTEACHER_QUERY: "${message}"`;

    // 6. Synthesis
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
      config: {
        systemInstruction,
        temperature: context.isGrounded ? 0.1 : 0.7,
        // Fallback to Google Search only if even the targeted Sindh scrape failed
        tools: (targetSLO && !context.webScrape && context.localChunks.length < 2) ? [{ googleSearch: {} }] : []
      }
    });

    const responseText = result.text || "Synthesis error: Neural node connection lost.";
    
    // Extract Metadata for Grounding Display
    const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const searchLinks = groundingChunks
      .filter((chunk: any) => chunk.web)
      .map((chunk: any) => `* [${chunk.web.title}](${chunk.web.uri})`)
      .join('\n');

    // 7. Orchestrate Stream
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        // Status Alerts
        if (context.groundingSource === 'web' || context.groundingSource === 'mixed') {
          controller.enqueue(encoder.encode(`> *Neural Research Mode: Scraped Sindh Curriculum Portal (dcar.gos.pk)...*\n\n`));
        } else if (context.groundingSource === 'local') {
          controller.enqueue(encoder.encode(`> *Neural Sync Mode: Grounded in your PDF library assets.*\n\n`));
        }

        controller.enqueue(encoder.encode(responseText));

        // Source Footer
        let footer = '';
        if (context.webScrape) {
          footer += `\n\n### Scraped Sindh Portal Context:\n* [${context.webScrape.title}](${context.webScrape.url})`;
        }
        if (searchLinks) {
          footer += `\n\n### Additional Web Sources:\n${searchLinks}`;
        }
        
        if (footer) controller.enqueue(encoder.encode(footer));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error('❌ [Neural Synthesis Fatal]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
