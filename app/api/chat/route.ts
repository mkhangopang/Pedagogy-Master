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
 * NEURAL TUTOR ENGINE (v11.0 - ROBUST GROUNDING)
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
    const { data: selectedDocs } = await supabase
      .from('documents')
      .select('id, name, authority')
      .eq('user_id', user.id)
      .or(`is_selected.eq.true${priorityDocumentId ? `,id.eq.${priorityDocumentId}` : ''}`)
      .in('status', ['ready', 'completed']);

    const finalFilterIds = selectedDocs?.map(d => d.id) || [];
    console.log(`🤖 [Chat API] Active Assets: ${finalFilterIds.length} | Priority: ${priorityDocumentId || 'None'}`);
    
    // 2. Retrieval (XML Unified Vault)
    let contextVault = "";
    let chunks: any[] = [];

    if (finalFilterIds.length > 0) {
      chunks = await retrieveRelevantChunks(message, finalFilterIds, supabase, 12, priorityDocumentId);
      
      if (chunks.length > 0) {
        contextVault = `<AUTHORITATIVE_VAULT>\n`;
        chunks.forEach((c, i) => {
          contextVault += `[NODE_${i+1}] SOURCE_SLOS: ${c.sloCodes?.join(', ') || 'Global'}\nCONTENT: ${c.text}\n\n`;
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
- SYNCED_NODES: ${chunks.length}

${chunks.length > 0 ? NUCLEAR_GROUNDING_DIRECTIVE : ''}
- MANDATORY: If <AUTHORITATIVE_VAULT> exists, you have DIRECT ACCESS to curriculum standards. Cite the document "${selectedDocs?.[0]?.name || 'the active file'}".
`;

    // 4. Remote Neural Call (Gemini)
    const apiKey = resolveApiKey();
    if (!apiKey) throw new Error("Synthesis node offline: API Key missing.");
    
    const ai = new GoogleGenAI({ apiKey });
    
    const contents: any[] = [];
    history.slice(-10).forEach((h: any) => {
      contents.push({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] });
    });
    
    const finalPrompt = `
${contextVault}

# USER COMMAND:
"${message}"
`;
    
    // Non-alternating role collapse logic
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

    const responseText = result.text || `Synthesis bottleneck. The model was unable to generate a response for this query. (Status: ${chunks.length > 0 ? 'Grounded' : 'General'})`;

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        if (chunks.length > 0) {
          controller.enqueue(encoder.encode(`> *Neural Sync: Successfully retrieved ${chunks.length} nodes from "${selectedDocs?.[0]?.name}"...*\n\n`));
        }
        
        controller.enqueue(encoder.encode(responseText));
        
        if (chunks.length > 0) {
          const refs = `\n\n### Grounding Profile:\n` + 
            chunks.slice(0, 3).map(c => `* **Standard ${c.sloCodes?.[0] || 'Asset'}** (${(c.similarity * 100).toFixed(0)}% match)`).join('\n');
          controller.enqueue(encoder.encode(refs));
        }
        
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [CHAT ROUTE ERROR]:", error);
    return NextResponse.json({ 
      error: "RAG_NODE_DISCONNECT: " + (error.message || "Unknown error") 
    }, { status: 500 });
  }
}