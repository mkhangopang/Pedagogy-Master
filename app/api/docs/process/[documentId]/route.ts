import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 300; // Extend to 5 mins for massive PDFs

/**
 * NEURAL PROCESSING NODE (v4.8)
 * Triggered after upload to perform heavy extraction, vectorization, and pedagogical analysis.
 * Uses Admin Client for updates to ensure background persistence during heavy AI cycles.
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  
  // Use user client for initial verification
  const userSupabase = getSupabaseServerClient(token);
  // Use admin client for internal status updates to avoid RLS/Auth-expiry issues during long Node.js execution
  const adminSupabase = getSupabaseAdminClient();

  try {
    if (!token) throw new Error("Auth Required");

    // Verify ownership before proceeding with admin client
    const { data: { user } } = await userSupabase.auth.getUser(token);
    if (!user) throw new Error("Identity verification failed.");

    // 1. Initial State Update: Immediate Feedback
    await adminSupabase.from('documents').update({ 
      document_summary: 'Binary anchored. Initializing neural extraction...',
      status: 'processing'
    }).eq('id', documentId);

    // 2. Fetch metadata
    const { data: doc, error: fetchErr } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (fetchErr || !doc) throw new Error("Document meta retrieval failed.");

    // 3. Fetch binary from R2
    await adminSupabase.from('documents').update({ document_summary: 'Streaming curriculum bits from cloud vault...' }).eq('id', documentId);
    const buffer = await getObjectBuffer(doc.file_path);
    if (!buffer) throw new Error("Binary node unreachable in Cloudflare R2.");

    // 4. Extract Text (Server-side)
    await adminSupabase.from('documents').update({ document_summary: 'Parsing curriculum schema (PDF Extraction)...' }).eq('id', documentId);
    const pdfModule = await import('pdf-parse');
    const pdf: any = pdfModule.default || pdfModule;
    const data = await pdf(buffer);
    const extractedText = data.text || "";

    if (extractedText.length < 50) {
      throw new Error("PDF contained insufficient extractable text (Might be scanned image/empty).");
    }

    // 5. Update status and start Vector Sync
    await adminSupabase.from('documents').update({ 
      extracted_text: extractedText,
      status: 'indexing',
      document_summary: 'Synchronizing curriculum nodes with vector grid (RAG Indexing)...'
    }).eq('id', documentId);

    // 6. Build Vector Grid (Heavy Logic)
    await indexDocumentForRAG(documentId, extractedText, doc.file_path, adminSupabase);

    // 7. Pedagogical Analysis (Summary & SLOs)
    await adminSupabase.from('documents').update({ document_summary: 'Synthesizing pedagogical metadata & SLO maps...' }).eq('id', documentId);
    
    // Perform AI analysis - this is the most likely step to timeout on Hobby, but index should be done by now
    await analyzeDocumentWithAI(documentId, user.id, adminSupabase);

    // 8. Finalize Node
    await adminSupabase.from('documents').update({ status: 'ready' }).eq('id', documentId);

    return NextResponse.json({ success: true, message: "Ingestion finalized and intelligence extracted." });

  } catch (error: any) {
    console.error("❌ [Processing Node Fault]:", error);
    // Explicitly set failure so polling stops
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Neural Fault: ${error.message}`
    }).eq('id', documentId);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}