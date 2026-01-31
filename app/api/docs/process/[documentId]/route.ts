import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';

export const runtime = 'nodejs';
export const maxDuration = 300; // Extend to 5 mins for massive PDFs

/**
 * NEURAL PROCESSING NODE
 * Triggered after upload to perform heavy extraction and vectorization.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const { documentId } = params;
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth Required' }, { status: 401 });

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

    // 4. Update status and trigger Vector Sync
    await supabase.from('documents').update({ 
      extracted_text: extractedText,
      status: 'indexing' 
    }).eq('id', documentId);

    // 5. Build Vector Grid
    await indexDocumentForRAG(documentId, extractedText, doc.file_path, supabase);

    return NextResponse.json({ success: true, message: "Ingestion finalized." });

  } catch (error: any) {
    console.error("❌ [Processing Node Fault]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}