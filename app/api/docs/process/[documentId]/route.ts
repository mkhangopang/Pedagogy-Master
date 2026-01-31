import { NextRequest, NextResponse } from 'next/server';
// Add comment above each fix
// Fix: Added missing Buffer import to resolve "Cannot find name 'Buffer'" error
import { Buffer } from 'buffer';
import { getSupabaseServerClient, getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 300; // Extend to 5 mins for massive PDFs

/**
 * NEURAL PROCESSING NODE (v4.9)
 * Optimized for robustness in Vercel Serverless environment.
 * Fixed: 'ENOENT' error caused by pdf-parse failing to receive a valid native Buffer.
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
    if (!token) throw new Error("Auth Required");

    // 1. Initial State Update
    await adminSupabase.from('documents').update({ 
      document_summary: 'Binary anchored. Initializing neural extraction...',
      status: 'processing'
    }).eq('id', documentId);

    // 2. Fetch metadata
    const { data: doc, error: fetchErr } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (fetchErr || !doc) throw new Error("Document meta retrieval failed.");

    // 3. Fetch binary from R2
    await adminSupabase.from('documents').update({ document_summary: 'Streaming curriculum bits from vault...' }).eq('id', documentId);
    const buffer = await getObjectBuffer(doc.file_path);
    
    if (!buffer || buffer.length === 0) {
      throw new Error("Zero-byte binary or unreachable node in Cloudflare R2.");
    }

    // 4. Extract Text (Server-side)
    await adminSupabase.from('documents').update({ document_summary: 'Parsing curriculum schema (Neural Extraction)...' }).eq('id', documentId);
    
    let extractedText = "";
    try {
      const pdfModule = await import('pdf-parse');
      // Add comment above each fix
      // Fix: Cast pdf to any to resolve "expression is not callable" error in ESM/CJS interop
      const pdf: any = pdfModule.default || pdfModule;
      
      // Ensure we pass a real Node.js Buffer to prevent ENOENT test fallback
      const data = await pdf(Buffer.from(buffer));
      extractedText = data.text || "";
    } catch (parseErr: any) {
      console.error("Primary PDF Parse Failed, attempting fallback...", parseErr);
      // Fallback: If pdf-parse fails, it might be due to environment. 
      // Manual text extraction from buffer as last resort for RAG if pdfjs-dist is complex to setup here
      throw new Error(`PDF extraction node failed: ${parseErr.message}`);
    }

    if (extractedText.length < 20) {
      throw new Error("PDF contained insufficient extractable text. Scanned images are not supported yet.");
    }

    // 5. Update status and start Vector Sync
    await adminSupabase.from('documents').update({ 
      extracted_text: extractedText,
      status: 'indexing',
      document_summary: 'Synchronizing curriculum nodes with vector grid...'
    }).eq('id', documentId);

    // 6. Build Vector Grid
    await indexDocumentForRAG(documentId, extractedText, doc.file_path, adminSupabase);

    // 7. Pedagogical Analysis
    await adminSupabase.from('documents').update({ document_summary: 'Synthesizing pedagogical metadata...' }).eq('id', documentId);
    
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       await analyzeDocumentWithAI(documentId, user.id, adminSupabase);
    }

    // 8. Finalize
    await adminSupabase.from('documents').update({ status: 'ready' }).eq('id', documentId);

    return NextResponse.json({ success: true, message: "Ingestion finalized." });

  } catch (error: any) {
    console.error("❌ [Processing Node Fault]:", error);
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Neural Fault: ${error.message}`
    }).eq('id', documentId);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}