import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';
import { convertToPedagogicalMarkdown } from '../../../../../lib/rag/md-converter';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * NEURAL PROCESSING NODE (v19.0)
 * Protocol: PDF -> RAW TEXT -> MASTER MD -> DIALECT SYNC
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
    if (!token) throw new Error("Authorization Required");

    // 1. Handshake
    await adminSupabase.from('documents').update({ 
      document_summary: 'Re-structuring Curriculum Hierarchy...',
      status: 'processing'
    }).eq('id', documentId);

    // 2. Fetch metadata
    const { data: doc } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error("Asset retrieval failed.");

    // 3. Fetch binary
    const buffer = await getObjectBuffer(doc.file_path);
    if (!buffer) throw new Error("Binary node unreachable.");

    // 4. Raw Text Extraction
    const rawResult = await pdf(buffer);
    const rawText = rawResult.text.trim();

    // 5. MASTER MD RESTRUCTURING
    await adminSupabase.from('documents').update({ document_summary: 'Constructing Master MD File...' }).eq('id', documentId);
    const cleanMd = await convertToPedagogicalMarkdown(rawText);
    const dialect = cleanMd.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/)?.[1] || 'Standard';

    // 6. Vector Synchronization
    await adminSupabase.from('documents').update({ 
      extracted_text: cleanMd,
      status: 'indexing',
      document_summary: `Synchronizing ${dialect} logic with hybrid grid...`,
      master_md_dialect: dialect as any // Cast for schema if needed
    }).eq('id', documentId);

    await indexDocumentForRAG(documentId, cleanMd, doc.file_path, adminSupabase);

    // 7. Intelligence Analysis
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       await analyzeDocumentWithAI(documentId, user.id, adminSupabase);
    }

    // 8. Finalize
    await adminSupabase.from('documents').update({ 
      status: 'ready',
      rag_indexed: true
    }).eq('id', documentId);

    return NextResponse.json({ 
      success: true, 
      message: "Pedagogical Master MD ingestion finalized.",
      dialect: dialect
    });

  } catch (error: any) {
    console.error("❌ [Processing Node Fault]:", error);
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Extraction Fault: ${error.message}`
    }).eq('id', documentId);
    
    return NextResponse.json({ error: error.message, status: 'failed' }, { status: 500 });
  }
}