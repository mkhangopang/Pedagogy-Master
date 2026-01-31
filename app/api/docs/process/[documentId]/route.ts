import { NextRequest, NextResponse } from 'next/server';
// Fix: Ensure native Buffer is available for pdf-parse logic
import { Buffer } from 'buffer';
import { getSupabaseServerClient, getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 300; // Extend to 5 mins for massive PDFs

/**
 * NEURAL PROCESSING NODE (v5.1)
 * Triggered after binary stream to perform heavy extraction, vectorization, and pedagogical analysis.
 * Fixed: 'ENOENT' error caused by pdf-parse failing to receive a valid native Buffer.
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  
  // Use Admin client to ensure status updates persist even if user session flickers
  const adminSupabase = getSupabaseAdminClient();

  try {
    if (!token) throw new Error("Authorization Required");

    // 1. Initial State Update: Kill the "Waiting for binary handshake" status immediately
    await adminSupabase.from('documents').update({ 
      document_summary: 'Binary Anchored. Initializing neural extraction...',
      status: 'processing'
    }).eq('id', documentId);

    // 2. Fetch metadata
    const { data: doc, error: fetchErr } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (fetchErr || !doc) throw new Error("Document meta retrieval node failed.");

    // 3. Fetch binary from R2 Storage Node
    await adminSupabase.from('documents').update({ document_summary: 'Streaming curriculum bits from cloud vault...' }).eq('id', documentId);
    const buffer = await getObjectBuffer(doc.file_path);
    
    // CRITICAL: Prevent pdf-parse from triggering internal test data fallback (ENOENT)
    if (!buffer || buffer.length === 0) {
      throw new Error("Zero-byte binary stream detected or cloud node unreachable.");
    }

    // 4. Extract Text (Server-side Parsing)
    await adminSupabase.from('documents').update({ document_summary: 'Parsing curriculum schema (PDF extraction)...' }).eq('id', documentId);
    
    let extractedText = "";
    try {
      // Dynamic import with defensive check
      const pdfModule = await import('pdf-parse');
      const pdf: any = pdfModule.default || pdfModule;
      
      // Ensure we pass a real Node.js Buffer to prevent ENOENT test data fallback errors
      const pdfBuffer = Buffer.from(buffer);
      if (pdfBuffer.length < 100) throw new Error("Invalid PDF header detected.");
      
      const data = await pdf(pdfBuffer);
      extractedText = data.text || "";
    } catch (parseErr: any) {
      console.error("Primary PDF Parse Node Failed:", parseErr);
      throw new Error(`PDF extraction failed: ${parseErr.message}`);
    }

    if (extractedText.length < 20) {
      throw new Error("PDF contained insufficient extractable text (Scanned image or empty node).");
    }

    // 5. Update status and start Vector Grid Synchronization
    await adminSupabase.from('documents').update({ 
      extracted_text: extractedText,
      status: 'indexing',
      document_summary: 'Synchronizing curriculum nodes with vector grid...'
    }).eq('id', documentId);

    // 6. Build Vector Grid (Heavy RAG Logic)
    await indexDocumentForRAG(documentId, extractedText, doc.file_path, adminSupabase);

    // 7. Pedagogical Intelligence Extraction
    await adminSupabase.from('documents').update({ document_summary: 'Synthesizing pedagogical metadata & SLO maps...' }).eq('id', documentId);
    
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       // This step can take up to 60s for 180+ page PDFs
       await analyzeDocumentWithAI(documentId, user.id, adminSupabase);
    }

    // 8. Finalize Node Ingestion
    await adminSupabase.from('documents').update({ 
      status: 'ready',
      document_summary: 'Neural node anchored. Ready for synthesis.' 
    }).eq('id', documentId);

    return NextResponse.json({ success: true, message: "Curriculum ingestion finalized." });

  } catch (error: any) {
    console.error("❌ [Neural Processing Exception]:", error);
    // Explicitly set failure status so UI polling stops and displays the error
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Neural Fault: ${error.message}`
    }).eq('id', documentId);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}