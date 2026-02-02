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
 * NEURAL PROCESSING NODE (v18.0)
 * Protocol: PDF -> RAW TEXT -> CLEAN MD -> RAG INDEX
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

    // 1. Initial State
    await adminSupabase.from('documents').update({ 
      document_summary: 'Initializing secure neural extraction...',
      status: 'processing'
    }).eq('id', documentId);

    // 2. Fetch metadata
    const { data: doc } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (!doc) throw new Error("Document metadata retrieval failed.");

    // 3. Fetch binary
    const buffer = await getObjectBuffer(doc.file_path);
    if (!buffer) throw new Error("Zero-byte binary detected.");

    // 4. Raw Text Extraction
    await adminSupabase.from('documents').update({ document_summary: 'Parsing raw PDF bits...' }).eq('id', documentId);
    const rawResult = await pdf(buffer);
    const rawText = rawResult.text.trim();

    if (rawText.length < 20) throw new Error("Insufficient text data found.");

    // 5. NEURAL MD RESTRUCTURING (The "Clean Room" Step)
    await adminSupabase.from('documents').update({ document_summary: 'Generating Pedagogical Markdown Grid...' }).eq('id', documentId);
    const cleanMd = await convertToPedagogicalMarkdown(rawText);

    // 6. Synchronize with Vector Grid (RAG)
    await adminSupabase.from('documents').update({ 
      extracted_text: cleanMd, // Save the clean MD version
      status: 'indexing',
      document_summary: 'Synchronizing clean MD nodes with vector grid...'
    }).eq('id', documentId);

    await indexDocumentForRAG(documentId, cleanMd, doc.file_path, adminSupabase);

    // 7. Pedagogical Intelligence Synthesis
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       await analyzeDocumentWithAI(documentId, user.id, adminSupabase);
    }

    // 8. Finalize
    await adminSupabase.from('documents').update({ 
      status: 'ready',
      rag_indexed: true
    }).eq('id', documentId);

    return NextResponse.json({ success: true, message: "Curriculum MD Ingestion Finalized." });

  } catch (error: any) {
    console.error("❌ [Processing Node Exception]:", error);
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Extraction Fault: ${error.message}`
    }).eq('id', documentId);
    
    return NextResponse.json({ error: error.message, status: 'failed' }, { status: 500 });
  }
}