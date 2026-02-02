import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';
import { convertToPedagogicalMarkdown } from '../../../../../lib/rag/md-converter';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Increased to 5 mins for high-volume curricula

/**
 * NEURAL PROCESSING GATEWAY (v22.0)
 * Protocol: PDF -> RAW -> MASTER MD (LINEARIZED) -> VECTOR SYNC
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  
  const adminSupabase = getSupabaseAdminClient();

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
    const rawResult = await pdf(buffer);
    const rawText = rawResult.text.trim();

    // 4. NEURAL MASTER-MD CONVERSION (Parallel Grid Flattener)
    await adminSupabase.from('documents').update({ document_summary: 'Constructing Linear Master MD...' }).eq('id', documentId);
    const cleanMd = await convertToPedagogicalMarkdown(rawText);
    const dialect = cleanMd.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

    // 5. High-Precision Vector Synchronization
    await adminSupabase.from('documents').update({ 
      extracted_text: cleanMd,
      status: 'indexing',
      document_summary: `Syncing ${dialect} standards with vector grid...`,
      master_md_dialect: dialect as any
    }).eq('id', documentId);

    await indexDocumentForRAG(documentId, cleanMd, doc.file_path, adminSupabase);

    // 6. Institutional Intelligence Pass
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       await analyzeDocumentWithAI(documentId, user.id, adminSupabase);
    }

    // 7. Final Completion State
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