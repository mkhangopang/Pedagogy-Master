
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { retrieveRelevantChunks } from '../../../lib/rag/retriever';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { DEFAULT_MASTER_PROMPT, NUCLEAR_GROUNDING_DIRECTIVE } from '../../../constants';
import { resolveApiKey } from '../../../lib/env-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * NEURAL TUTOR ENGINE (v10.0 - STABLE GROUNDING)
 * Robust context access for indexed documents.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { message, priorityDocumentId, history = [] } = body;

    const supabase = getSupabaseServerClient(token);

    // 1. Resolve Document Context (Check for both ready and completed)
    const { data: selectedDocs, error: docFetchError } = await supabase
      .from('documents')
      .select('id, name, authority')
      .eq('user_id', user.id)
      .or(`is_selected.eq.true${priorityDocumentId ? `,id.eq.${priorityDocumentId}` : ''}`)
      .in('status', ['ready', 'completed']);

    if (docFetchError) console.error('Doc Fetch Error:', docFetchError);

    const finalFilterIds = selectedDocs?.map(d => d.id) || [];
    console.log(`🤖 [Chat API] User: ${user.email} | Active Assets: ${finalFilterIds.length}`);
    
    // 2. Retrieval (XML Unified Vault)
    let contextVault = "";
    let chunks: any[] = [];

    if (finalFilterIds.length > 0) {
      chunks = await retrieveRelevantChunks(message, finalFilterIds, supabase, 15, priorityDocumentId);
      
      if (chunks.length > 0) {
        contextVault = `<AUTHORITATIVE_VAULT>\n`;
        chunks.forEach((c, i) => {
          contextVault += `[CHUNK_${i+1}] SOURCE: ${c.sloCodes?.join(', ') || 'General'}\nCONTENT: ${c.text}\n\n`;
        });
        contextVault += `</AUTHORITATIVE_VAULT>\n`;
      }
    }

    // 3. System Instruction Assembly
    const { data: brainData } = await supabase
      .from('neural_brain')
      .select('master_prompt')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const basePersona = brainData?.master_prompt || DEFAULT_MASTER_PROMPT;
    
    const systemInstruction = `
${basePersona}

## NEURAL STATE: ${chunks.length > 0 ? 'GROUNDED_MODE' : 'GENERAL_MODE'}
- TARGET_AUTHORITY: ${selectedDocs?.[0]?.authority || 'General'}
- DATA_STATUS: ${chunks.length > 0 ? `SYNCED (${chunks.length} nodes)` : 'UNSYNCED'}

${chunks.length > 0 ? NUCLEAR_GROUNDING_DIRECTIVE : ''}
- MANDATORY: If <AUTHORITATIVE_VAULT> exists, you have DIRECT ACCESS to the curriculum. Never say "I don't have access".
- CITATION: Mention the document name "${selectedDocs?.[0]?.name || 'the curriculum'}" in your answer.
`;

    // 4. Remote Neural Call (Gemini)
    const apiKey = resolveApiKey();
    if (!apiKey) throw new Error("API Key configuration missing.");
    
    const ai = new GoogleGenAI({ apiKey });
    
    const contents: any[] = [];
    history.slice(-8).forEach((h: any) => {
      contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] });
    });
    
    const finalPrompt = `
${contextVault}

# USER QUERY
"${message}"
`;
    
    // Handle history/message sequence logic
    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents[contents.length - 1].parts[0].text += `\n\n${finalPrompt}`;
    } else {
      contents.push({ role: 'user', parts: [{ text: finalPrompt }] });
    }

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents,
      config: { 
        systemInstruction,
        temperature: chunks.length > 0 ? 0.1 : 0.6,
        topK: 40,
        topP: 0.95
      }
    });

    const responseText = result.text || "Synthesis error: Model returned no data. Possible safety filter or token limit.";

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        if (chunks.length > 0) {
          controller.enqueue(encoder.encode(`> *Neural Sync: Accessing ${chunks.length} curriculum nodes from "${selectedDocs?.[0]?.name}"...*\n\n`));
        }
        
        controller.enqueue(encoder.encode(responseText));
        
        if (chunks.length > 0) {
          const refs = `\n\n### Grounding References:\n` + 
            chunks.slice(0, 3).map(c => `* **Standard ${c.sloCodes?.[0] || 'Node'}** - ${(c.similarity * 100).toFixed(0)}% relevant match`).join('\n');
          controller.enqueue(encoder.encode(refs));
        }
        
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [CHAT ROUTE ERROR]:", error);
    return NextResponse.json({ 
      error: "RAG_ABORT: " + (error.message || "Unknown synthesis failure") 
    }, { status: 500 });
  }
}
