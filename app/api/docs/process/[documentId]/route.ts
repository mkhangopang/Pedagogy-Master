
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
 * NEURAL PROCESSING GATEWAY (v24.0)
 * Protocol: PDF -> RAW -> MASTER MD (LINEARIZED) -> VECTOR SYNC
 * FIX: Expanded context window and reasoning model for high-fidelity conversion.
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

    // 1. Initial State Handshake
    await adminSupabase.from('documents').update({ 
      document_summary: 'Linearizing Curriculum Grids...',
      status: 'processing'
    }).eq('id', documentId);

    // 2. Binary Retrieval
    const { data: doc } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error("Target asset not found in grid.");

    const buffer = await getObjectBuffer(doc.file_path);
    if (!buffer) throw new Error("R2 Node unreachable.");

    // 3. Multi-Grade Text Extraction
    // No page limit: extract the entire curriculum
    const rawResult = await pdf(buffer);
    const rawText = rawResult.text.trim();

    if (rawText.length < 50) throw new Error("Extraction yielded insufficient content.");

    // Checkpoint: Approaching limit? We still push forward because md-converter v7.0 is much faster.
    if (Date.now() - startTime > 9000) {
       console.warn(`[Processor] Heavy load detected for ${documentId}. Entering High-Performance Mode.`);
    }

    // 4. NEURAL MASTER-MD CONVERSION (v7.0 Self-Correcting Node)
    const cleanMd = await convertToPedagogicalMarkdown(rawText);
    const dialectMatch = cleanMd.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/);
    const dialect = dialectMatch ? dialectMatch[1] : 'Standard';

    // 5. High-Precision Vector Synchronization
    await adminSupabase.from('documents').update({ 
      extracted_text: cleanMd,
      status: 'indexing',
      document_summary: `Syncing ${dialect} standards with vector grid...`,
      master_md_dialect: dialect as any
    }).eq('id', documentId);

    // This is the heavy lifting - handles 1500 char chunks
    await indexDocumentForRAG(documentId, cleanMd, doc.file_path, adminSupabase);

    // 6. Institutional Intelligence Pass
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       // Deep analysis in background
       analyzeDocumentWithAI(documentId, user.id, adminSupabase).catch(e => console.error("Background Intelligence Fail:", e));
    }

    // 7. Final Completion State
    await adminSupabase.from('documents').update({ 
      status: 'ready',
      rag_indexed: true,
      document_summary: `Neural Sync Complete. Dialect: ${dialect}. Fully Reconstructed.`
    }).eq('id', documentId);

    return NextResponse.json({ 
      success: true, 
      dialect: dialect,
      message: "Curriculum linearized, reconstructed and indexed."
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
