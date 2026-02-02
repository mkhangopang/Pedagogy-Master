import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * NEURAL PROCESSING NODE (v15.0)
 * AUDIT OPTIMIZED: Robust error handling and state synchronization.
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

    // 1. Initial State Update - Force clear any stale error messages
    await adminSupabase.from('documents').update({ 
      document_summary: 'Initializing secure neural extraction...',
      status: 'processing',
      error_message: null
    }).eq('id', documentId);

    // 2. Fetch metadata
    const { data: doc, error: fetchErr } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (fetchErr || !doc) throw new Error("Document metadata retrieval failed.");

    // 3. Fetch binary from Cloudflare R2
    await adminSupabase.from('documents').update({ document_summary: 'Streaming curriculum bits from vault...' }).eq('id', documentId);
    const buffer = await getObjectBuffer(doc.file_path);
    
    if (!buffer || buffer.length === 0) {
      throw new Error("Zero-byte binary detected. Ingestion aborted.");
    }

    // 4. Robust Text Extraction
    await adminSupabase.from('documents').update({ document_summary: 'Parsing curriculum schema (Neural Node)...' }).eq('id', documentId);
    
    let extractedText = "";
    try {
      // pdf-parse can be memory intensive, wrapped in local block
      const data = await pdf(buffer);
      extractedText = data.text.trim();
    } catch (parseErr: any) {
      console.error("PDF Extraction Fault:", parseErr);
      throw new Error(`Neural extraction engine fault: ${parseErr.message}`);
    }

    if (extractedText.length < 20) {
      throw new Error("Extraction result: The document contains insufficient text data.");
    }

    // 5. Synchronize with Vector Grid (RAG)
    await adminSupabase.from('documents').update({ 
      extracted_text: extractedText,
      status: 'indexing',
      document_summary: 'Synchronizing nodes with vector grid...'
    }).eq('id', documentId);

    // This function now handles rag_indexed: true internally
    await indexDocumentForRAG(documentId, extractedText, doc.file_path, adminSupabase);

    // 6. Pedagogical Intelligence Synthesis
    await adminSupabase.from('documents').update({ document_summary: 'Synthesizing pedagogical metadata...' }).eq('id', documentId);
    
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       try {
         // This function handles its own database updates for summary, subject, grade, etc.
         await analyzeDocumentWithAI(documentId, user.id, adminSupabase);
       } catch (aiErr: any) {
         console.warn("AI Analysis Failed (Non-Fatal):", aiErr);
       }
    }

    // 7. Finalize Node Ingestion
    // Final sanity check: Ensure rag_indexed is definitely true and status is ready
    await adminSupabase.from('documents').update({ 
      status: 'ready',
      rag_indexed: true,
      error_message: null
    }).eq('id', documentId);

    return NextResponse.json({ success: true, message: "Curriculum ingestion finalized." });

  } catch (error: any) {
    console.error("❌ [Processing Node Exception]:", error);
    // AUDIT FIX: Ensure status is updated to 'failed' so it's not stuck in 'processing'
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Extraction Fault: ${error.message}`,
      rag_indexed: false
    }).eq('id', documentId);
    
    return NextResponse.json({ 
      error: error.message,
      status: 'failed'
    }, { status: 500 });
  }
}
