import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'buffer';
import { getSupabaseServerClient, getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';

// Import pdfjs-dist specifically for Node environment
import * as pdfjs from 'pdfjs-dist';

export const runtime = 'nodejs';
export const maxDuration = 300; 

/**
 * NEURAL PROCESSING NODE (v6.0)
 * Optimized for robustness in Vercel Serverless environment.
 * Fixed: 'ENOENT' error caused by pdf-parse's internal filesystem dependencies.
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

    // 1. Initial State Update
    await adminSupabase.from('documents').update({ 
      document_summary: 'Binary Anchored. Initializing neural extraction...',
      status: 'processing'
    }).eq('id', documentId);

    // 2. Fetch metadata
    const { data: doc, error: fetchErr } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (fetchErr || !doc) throw new Error("Document metadata retrieval failed.");

    // 3. Fetch binary from R2
    await adminSupabase.from('documents').update({ document_summary: 'Streaming curriculum bits from cloud vault...' }).eq('id', documentId);
    const buffer = await getObjectBuffer(doc.file_path);
    
    if (!buffer || buffer.length === 0) {
      throw new Error("Zero-byte binary stream detected or cloud node unreachable.");
    }

    // 4. Extract Text (Using robust pdfjs-dist)
    await adminSupabase.from('documents').update({ document_summary: 'Parsing curriculum schema (Neural Extraction)...' }).eq('id', documentId);
    
    let extractedText = "";
    try {
      const uint8Array = new Uint8Array(buffer);
      const loadingTask = pdfjs.getDocument({
        data: uint8Array,
        useSystemFonts: true,
        disableFontFace: true,
      });
      
      const pdf = await loadingTask.promise;
      let fullText = "";
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        // @ts-ignore
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
      }
      
      extractedText = fullText.trim();
    } catch (parseErr: any) {
      console.error("PDF Extraction Failed:", parseErr);
      throw new Error(`Neural extraction engine fault: ${parseErr.message}`);
    }

    if (extractedText.length < 50) {
      throw new Error("PDF contained insufficient extractable text (Scanned images are not supported).");
    }

    // 5. Update status and start Vector Sync
    await adminSupabase.from('documents').update({ 
      extracted_text: extractedText,
      status: 'indexing',
      document_summary: 'Synchronizing curriculum nodes with vector grid...'
    }).eq('id', documentId);

    // 6. Build Vector Grid
    await indexDocumentForRAG(documentId, extractedText, doc.file_path, adminSupabase);

    // 7. Pedagogical Intelligence Extraction
    await adminSupabase.from('documents').update({ document_summary: 'Synthesizing pedagogical metadata & SLO maps...' }).eq('id', documentId);
    
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       await analyzeDocumentWithAI(documentId, user.id, adminSupabase);
    }

    // 8. Finalize Node Ingestion
    await adminSupabase.from('documents').update({ 
      status: 'ready',
      document_summary: 'Neural node anchored. Ready for synthesis.' 
    }).eq('id', documentId);

    return NextResponse.json({ success: true, message: "Curriculum ingestion finalized." });

  } catch (error: any) {
    console.error("❌ [Processing Node Exception]:", error);
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Neural Fault: ${error.message}`
    }).eq('id', documentId);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}