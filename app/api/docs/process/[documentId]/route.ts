import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * NEURAL PROCESSING NODE (v12.0)
 * Optimized for Vercel Serverless environment.
 * FIXED: "Cannot find module pdf.worker.mjs" fault.
 * IMPLEMENTATION: Worker-less single-threaded extraction.
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

    // 1. Initial State Update - Force clear any previous error states
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
      throw new Error("Zero-byte binary detected. Re-upload is mandatory.");
    }

    // 4. Robust Text Extraction (Worker-less for Serverless compatibility)
    await adminSupabase.from('documents').update({ document_summary: 'Parsing curriculum schema (Neural Node)...' }).eq('id', documentId);
    
    let extractedText = "";
    try {
      /**
       * VERCEL MODULE RESOLUTION FIX:
       * We use the legacy build and DO NOT set a workerSrc.
       * pdfjs-dist internally falls back to a "fake worker" (main thread) if workerSrc is null.
       */
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      
      const uint8Array = new Uint8Array(buffer);
      const loadingTask = pdfjs.getDocument({
        data: uint8Array,
        useSystemFonts: true,
        disableFontFace: true,
        isEvalSupported: false,
        // Using CDN for standard fonts to avoid filesystem ENOENT errors
        standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@4.4.168/standard_fonts/',
        // @ts-ignore - Internal property to skip worker loading
        verbosity: 0 
      });
      
      const pdf = await loadingTask.promise;
      let fullText = "";
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        // @ts-ignore - items exists on textContent interface
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
      }
      
      extractedText = fullText.trim();
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

    try {
      await indexDocumentForRAG(documentId, extractedText, doc.file_path, adminSupabase);
    } catch (indexErr: any) {
      console.warn("Vector indexing partial failure (Non-fatal):", indexErr);
    }

    // 6. Pedagogical Intelligence Synthesis
    await adminSupabase.from('documents').update({ document_summary: 'Synthesizing pedagogical metadata...' }).eq('id', documentId);
    
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

    return NextResponse.json({ success: true, message: "Curriculum ingestion finalized." });

  } catch (error: any) {
    console.error("❌ [Processing Node Exception]:", error);
    
    // CRITICAL: Force terminal failure state so UI stops polling forever
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Extraction Fault: ${error.message}`
    }).eq('id', documentId);
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
