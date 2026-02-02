
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';
import { convertToPedagogicalMarkdown } from '../../../../../lib/rag/md-converter';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * NEURAL PROCESSING GATEWAY (v25.0 - OPTIMIZED)
 * Protocol: [RAW_TEXT] -> MASTER MD (LINEARIZED) -> VECTOR SYNC
 * FIX: Skips server-side PDF parsing if text is pre-extracted by client.
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  
  const adminSupabase = getSupabaseAdminClient();
  const startTime = Date.now();

  try {
    if (!token) throw new Error("Security handshake failed: No token.");

    // 1. Fetch document record (includes pre-extracted text if client-side extraction worked)
    const { data: doc, error: fetchError } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (fetchError || !doc) throw new Error("Target asset not found in grid.");

    let rawText = doc.extracted_text || "";

    // 2. Fallback: Parse PDF if text is missing (e.g. API upload or old flow)
    if (!rawText || rawText.length < 50) {
      await adminSupabase.from('documents').update({ document_summary: 'Extracting binary nodes (Legacy Fallback)...' }).eq('id', documentId);
      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error("R2 Node unreachable.");
      const rawResult = await pdf(buffer);
      rawText = rawResult.text.trim();
    }

    if (rawText.length < 50) throw new Error("Extraction yielded insufficient content.");

    // 3. NEURAL MASTER-MD CONVERSION (v7.0 Self-Correcting Node)
    // This part is intensive, we ensure we have as much time as possible.
    await adminSupabase.from('documents').update({ document_summary: 'Linearizing Curriculum Grids...' }).eq('id', documentId);
    
    const cleanMd = await convertToPedagogicalMarkdown(rawText);
    const dialectMatch = cleanMd.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/);
    const dialect = dialectMatch ? dialectMatch[1] : 'Standard';

    // 4. High-Precision Vector Synchronization
    await adminSupabase.from('documents').update({ 
      extracted_text: cleanMd,
      status: 'indexing',
      document_summary: `Syncing ${dialect} standards with vector grid...`,
      master_md_dialect: dialect as any
    }).eq('id', documentId);

    // handles 1500 char chunks
    await indexDocumentForRAG(documentId, cleanMd, doc.file_path, adminSupabase);

    // 5. Institutional Intelligence Pass
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       // Fire-and-forget background analysis
       analyzeDocumentWithAI(documentId, user.id, adminSupabase).catch(e => console.error("Background Intelligence Fail:", e));
    }

    // 6. Final Completion State
    await adminSupabase.from('documents').update({ 
      status: 'ready',
      rag_indexed: true,
      document_summary: `Neural Sync Complete. Dialect: ${dialect}.`
    }).eq('id', documentId);

    return NextResponse.json({ 
      success: true, 
      dialect: dialect,
      message: "Curriculum linearized and indexed."
    });

  } catch (error: any) {
    console.error("❌ [Processor Fatal]:", error);
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Node Error: ${error.message}`
    }).eq('id', documentId);
    
    return NextResponse.json({ error: error.message, status: 'failed' }, { status: 500 });
  }
}
