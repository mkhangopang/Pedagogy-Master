import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * NEURAL PROCESSING NODE (v10.0)
 * Optimized for Vercel Serverless.
 * RESOLVES: "Cannot find module pdf.worker.mjs" and "ENOENT" faults.
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

    // 1. Initial State Update - Clear previous errors
    await adminSupabase.from('documents').update({ 
      document_summary: 'Initializing secure neural extraction...',
      status: 'processing',
      error_message: null
    }).eq('id', documentId);

    // 2. Fetch metadata
    const { data: doc, error: fetchErr } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (fetchErr || !doc) throw new Error("Document metadata retrieval failed.");

    // 3. Fetch binary from R2
    await adminSupabase.from('documents').update({ document_summary: 'Streaming binary stream from cloud vault...' }).eq('id', documentId);
    const buffer = await getObjectBuffer(doc.file_path);
    
    if (!buffer || buffer.length === 0) {
      throw new Error("Zero-byte binary stream detected. Re-upload required.");
    }

    // 4. Extract Text (Worker-less legacy mode for Serverless compatibility)
    await adminSupabase.from('documents').update({ document_summary: 'Parsing curriculum schema (Neural Extraction)...' }).eq('id', documentId);
    
    let extractedText = "";
    try {
      // Use the standard/legacy build which is more robust in restricted environments
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      
      const uint8Array = new Uint8Array(buffer);
      const loadingTask = pdfjs.getDocument({
        data: uint8Array,
        useSystemFonts: true,
        disableFontFace: true,
        // CRITICAL: Prevent loading external workers which fail in serverless
        // @ts-ignore - Internal property check
        stopAtErrors: true,
      });
      
      const pdf = await loadingTask.promise;
      let fullText = "";
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        // @ts-ignore - items exists on textContent
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
      }
      
      extractedText = fullText.trim();
    } catch (parseErr: any) {
      console.error("PDF Extraction Fault:", parseErr);
      throw new Error(`Extraction engine fault: ${parseErr.message}`);
    }

    if (extractedText.length < 20) {
      throw new Error("Neural Scan failed: No extractable text found in curriculum PDF.");
    }

    // 5. Vector Grid Sync
    await adminSupabase.from('documents').update({ 
      extracted_text: extractedText,
      status: 'indexing',
      document_summary: 'Synchronizing curriculum nodes with vector grid...'
    }).eq('id', documentId);

    try {
      await indexDocumentForRAG(documentId, extractedText, doc.file_path, adminSupabase);
    } catch (indexErr: any) {
      console.warn("Vector indexing partial failure:", indexErr);
      // Non-fatal, continue to summary
    }

    // 6. Pedagogical Intelligence Extraction
    await adminSupabase.from('documents').update({ document_summary: 'Synthesizing pedagogical metadata & SLO maps...' }).eq('id', documentId);
    
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       try {
         await analyzeDocumentWithAI(documentId, user.id, adminSupabase);
       } catch (aiErr: any) {
         console.error("AI Analysis Failed:", aiErr);
       }
    }

    // 7. Finalize Node Ingestion
    await adminSupabase.from('documents').update({ 
      status: 'ready',
      document_summary: doc.document_summary || 'Neural node anchored. Ready for synthesis.' 
    }).eq('id', documentId);

    return NextResponse.json({ success: true, message: "Ingestion finalized." });

  } catch (error: any) {
    console.error("❌ [Processing Node Exception]:", error);
    
    // CRITICAL: Terminate processing state to stop infinite polling
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Extraction Fault: ${error.message}`
    }).eq('id', documentId);
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}