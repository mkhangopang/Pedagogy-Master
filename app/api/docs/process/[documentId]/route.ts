import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 300; // Extend to 5 mins for massive PDFs

/**
 * NEURAL PROCESSING NODE (v4.7)
 * Triggered after upload to perform heavy extraction, vectorization, and pedagogical analysis.
 * Fix: Explicitly passing token to getUser() to ensure robust user context in serverless execution.
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await props.params;
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  const supabase = getSupabaseServerClient(token);

  try {
    if (!token) throw new Error("Auth Required");

    // 1. Initial State Update: Immediate Feedback
    await supabase.from('documents').update({ 
      document_summary: 'Binary anchored. Initializing neural extraction...',
      status: 'processing'
    }).eq('id', documentId);

    // 2. Fetch metadata
    const { data: doc, error: fetchErr } = await supabase.from('documents').select('*').eq('id', documentId).single();
    if (fetchErr || !doc) throw new Error("Document meta retrieval failed.");

    // 3. Fetch binary from R2
    await supabase.from('documents').update({ document_summary: 'Fetching binary stream from cloud vault...' }).eq('id', documentId);
    const buffer = await getObjectBuffer(doc.file_path);
    if (!buffer) throw new Error("Binary node unreachable.");

    // 4. Extract Text (Server-side)
    await supabase.from('documents').update({ document_summary: 'Parsing curriculum schema from PDF...' }).eq('id', documentId);
    const pdfModule = await import('pdf-parse');
    const pdf: any = pdfModule.default || pdfModule;
    const data = await pdf(buffer);
    const extractedText = data.text || "";

    // 5. Update status and start Vector Sync
    await supabase.from('documents').update({ 
      extracted_text: extractedText,
      status: 'indexing',
      document_summary: 'Synchronizing curriculum nodes with vector grid...'
    }).eq('id', documentId);

    // 6. Build Vector Grid (Heavy Logic)
    await indexDocumentForRAG(documentId, extractedText, doc.file_path, supabase);

    // 7. Pedagogical Analysis (Summary & SLOs)
    await supabase.from('documents').update({ document_summary: 'Synthesizing pedagogical metadata...' }).eq('id', documentId);
    
    // Fix: Explicitly pass the token to getUser for reliable server-side identity
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) {
       await analyzeDocumentWithAI(documentId, user.id, supabase);
    }

    // 8. Finalize Node
    await supabase.from('documents').update({ status: 'ready' }).eq('id', documentId);

    return NextResponse.json({ success: true, message: "Ingestion finalized and intelligence extracted." });

  } catch (error: any) {
    console.error("❌ [Processing Node Fault]:", error);
    // Explicitly set failure so polling stops
    await supabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Neural Fault: ${error.message}`
    }).eq('id', documentId);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}