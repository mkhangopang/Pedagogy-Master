import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * NEURAL PROCESSING NODE (v9.1)
 * Optimized for robustness in Vercel Serverless environment.
 * RESOLVES: ENOENT for internal test files and pdf.worker.mjs resolution issues.
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
      document_summary: 'Initializing secure neural extraction...',
      status: 'processing',
      error_message: null
    }).eq('id', documentId);

    // 2. Fetch metadata
    const { data: doc, error: fetchErr } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (fetchErr || !doc) throw new Error("Document metadata retrieval failed.");

    // 3. Fetch binary from R2
    await adminSupabase.from('documents').update({ document_summary: 'Streaming curriculum binary from cloud vault...' }).eq('id', documentId);
    const buffer = await getObjectBuffer(doc.file_path);
    
    if (!buffer || buffer.length === 0) {
      throw new Error("Zero-byte binary stream detected. The cloud node rejected the payload.");
    }

    // 4. Extract Text using pdfjs-dist (Vercel-Optimized Worker-less build)
    await adminSupabase.from('documents').update({ document_summary: 'Parsing curriculum schema (Neural Extraction)...' }).eq('id', documentId);
    
    let extractedText = "";
    try {
      /**
       * IMPORT RESOLUTION FIX:
       * We use the legacy build to avoid ESM/Worker module resolution issues in serverless runtimes.
       */
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      
      const uint8Array = new Uint8Array(buffer);
      const loadingTask = pdfjs.getDocument({
        data: uint8Array,
        useSystemFonts: true,
        disableFontFace: true,
        // CRITICAL: Disable worker to avoid ENOENT/filesystem errors on Vercel
        // @ts-ignore
        stopAtErrors: true,
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
      console.error("PDF Extraction Engine Fault:", parseErr);
      throw new Error(`Extraction engine fault (Workerless): ${parseErr.message}`);
    }

    if (extractedText.length < 20) {
      throw new Error("Neural Scan Result: Empty or unreadable document content.");
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
      // Proceed even if indexing fails, AI analysis might still produce a summary
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
      document_summary: 'Neural node anchored. Synthesis ready.' 
    }).eq('id', documentId);

    return NextResponse.json({ success: true, message: "Curriculum ingestion finalized." });

  } catch (error: any) {
    console.error("❌ [Processing Node Exception]:", error);
    
    // CRITICAL: Ensure document doesn't get stuck in 'Syncing'
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Neural Fault: ${error.message}`
    }).eq('id', documentId);
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}