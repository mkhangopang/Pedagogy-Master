import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '../../../lib/ai/multi-provider-router';
import { supabase as anonClient, getSupabaseServerClient } from '../../../lib/supabase';
import { retrieveRelevantChunks } from '../../../lib/rag/retriever';
import { extractSLOCodes } from '../../../lib/rag/slo-extractor';
import { 
  DEFAULT_MASTER_PROMPT, 
  NUCLEAR_GROUNDING_DIRECTIVE 
} from '../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * PEDAGOGY MASTER CHAT ENGINE (v16.0)
 * Operates as a Pedagogical Tool Factory.
 * FIX: Strict RAG grounding with <AUTHORITATIVE_VAULT> context injection.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

    const body = await req.json();
    const { message, toolType, history = [] } = body;

    const supabase = getSupabaseServerClient(token);

    // 1. Get user's selected curriculum document
    const { data: selectedDoc, error: docError } = await supabase
      .from('documents')
      .select('id, name, file_path')
      .eq('user_id', user.id)
      .eq('is_selected', true)
      .eq('rag_indexed', true)  // Only use fully indexed documents
      .single();

    let finalPrompt: string;
    let metadata: any = { isGrounded: false, chunksUsed: 0 };
    let synthesizedProvider = "gemini";

    if (selectedDoc) {
      console.log('✅ Selected document:', selectedDoc.name);
      
      // 2. Retrieve relevant curriculum chunks via RAG
      // Fix: Updated retrieveRelevantChunks call to use positional arguments as per its definition in lib/rag/retriever.ts
      const chunks = await retrieveRelevantChunks(
        message,
        [selectedDoc.id],
        supabase,
        5
      );

      if (chunks && chunks.length > 0) {
        const queriedSLOs = extractSLOCodes(message);
        
        // Build minimal SLO context
        const sloContext = chunks.slice(0, 3).map((chunk, idx) => `
[SLO NODE ${idx + 1}]
SLO_CODES: ${chunk.slo_codes?.join(', ') || 'None'}
OBJECTIVE: ${chunk.chunk_text.substring(0, 250)}...
---
        `).join('\n');

        metadata = {
          isGrounded: true,
          chunksUsed: chunks.length,
          sources: chunks.map(c => ({ similarity: c.combined_score, sloCodes: c.slo_codes }))
        };

        finalPrompt = `
${NUCLEAR_GROUNDING_DIRECTIVE}

${DEFAULT_MASTER_PROMPT}

<AUTHORITATIVE_VAULT>
${sloContext}
</AUTHORITATIVE_VAULT>

TOOL REQUEST TYPE: ${toolType || 'general'}
USER QUERY: ${message}

GENERATION INSTRUCTIONS:
- Use the SLO definitions above as learning objectives.
- Generate a STRUCTURED pedagogical tool (not a document summary).
- Apply 5E Model, Bloom's Taxonomy, and UDL principles.
- Create NEW instructional content appropriate for the grade level.
`;
      } else {
        // Fallback for document selected but no chunks found
        finalPrompt = `${DEFAULT_MASTER_PROMPT}\n\n⚡ Neural Note: No matching curriculum nodes found for this specific query. Synthesizing using Global Pedagogical Standards.\n\nUSER QUERY: ${message}`;
      }
    } else {
      // No document selected fallback
      finalPrompt = `${DEFAULT_MASTER_PROMPT}\n\n⚡ Neural Note: No curriculum document is currently selected or indexed. Generating based on Global Pedagogical Standards.\n\nUSER QUERY: ${message}`;
    }

    // 3. Execute Synthesis via Multi-Provider Grid
    const { text, provider } = await generateAIResponse(
      finalPrompt,
      history,
      user.id,
      supabase,
      "", 
      undefined,
      toolType,
      undefined,
      selectedDoc?.id
    );

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        if (metadata?.isGrounded) {
          controller.enqueue(encoder.encode(`> *🛡️ Neural Sync: Context locked to Authoritative Vault (${metadata.chunksUsed} nodes active). Generating aligned tool...*\n\n`));
        } else {
          controller.enqueue(encoder.encode(`> *⚡ Neural Note: Generating using Global Pedagogical Standards (Vault sync inactive).* \n\n`));
        }
        
        controller.enqueue(encoder.encode(text));
        
        if (metadata?.isGrounded && metadata.sources?.length > 0) {
          const refs = `\n\n---\n**Grounding Profile:**\n` + 
            metadata.sources.slice(0, 3).map((s: any) => `* Standard: **${s.sloCodes?.[0] || 'Curriculum'}** (Relevance: ${(s.similarity * 100).toFixed(0)}%)`).join('\n');
          controller.enqueue(encoder.encode(refs));
        }
        
        controller.enqueue(encoder.encode(`\n\n*Synthesis Node: ${provider}*`));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    console.error("❌ [CHAT ROUTE ERROR]:", error);
    return new Response(`AI Alert: Synthesis grid bottleneck. (Error: ${error.message})`, { status: 200 });
  }
}