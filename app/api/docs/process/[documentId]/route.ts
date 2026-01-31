import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 300; // Extend to 5 mins for massive PDFs

/**
 * NEURAL PROCESSING NODE (v4.5)
 * Triggered after upload to perform heavy extraction, vectorization, and pedagogical analysis.
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await props.params;
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) throw new Error("Auth Required");

    const supabase = getSupabaseServerClient(token);

    // 1. Fetch metadata
    const { data: doc, error: fetchErr } = await supabase.from('documents').select('*').eq('id', documentId).single();
    if (fetchErr || !doc) throw new Error("Document meta retrieval failed.");

    // 2. Fetch binary from R2
    const buffer = await getObjectBuffer(doc.file_path);
    if (!buffer) throw new Error("Binary node unreachable.");

    // 3. Extract Text (Server-side)
    const pdfModule = await import('pdf-parse');
    const pdf: any = pdfModule.default || pdfModule;
    const data = await pdf(buffer);
    const extractedText = data.text || "";

    // 4. Update status and start Vector Sync
    await supabase.from('documents').update({ 
      extracted_text: extractedText,
      status: 'indexing' 
    }).eq('id', documentId);

    // 5. Build Vector Grid (Heavy Logic)
    await indexDocumentForRAG(documentId, extractedText, doc.file_path, supabase);

    // 6. Pedagogical Analysis (Summary & SLOs)
    // We call this after indexing to ensure retrieval is possible while summary is being generated
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
       await analyzeDocumentWithAI(documentId, user.id, supabase);
    }

    // 7. Finalize Node
    await supabase.from('documents').update({ status: 'ready' }).eq('id', documentId);

    return NextResponse.json({ success: true, message: "Ingestion finalized and intelligence extracted." });

  } catch (error: any) {
    console.error("❌ [Processing Node Fault]:", error);
    // Explicitly set failure so polling stops
    const supabase = getSupabaseServerClient();
    await supabase.from('documents').update({ status: 'failed', error_message: error.message }).eq('id', (await props.params).documentId);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}