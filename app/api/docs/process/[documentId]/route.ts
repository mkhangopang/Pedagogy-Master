import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * NEURAL PROCESSING NODE (v13.0)
 * FIXED: 'pdf.worker.mjs' module not found error.
 * Optimized for Vercel Serverless using pdf-parse (Main-thread mode).
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

    // 3. Fetch binary from Cloudflare R2
    await adminSupabase.from('documents').update({ document_summary: 'Streaming curriculum bits from vault...' }).eq('id', documentId);
    const buffer = await getObjectBuffer(doc.file_path);
    
    if (!buffer || buffer.length === 0) {
      throw new Error("Zero-byte binary detected. Ingestion aborted.");
    }

    // 4. Robust Text Extraction (Using pdf-parse for Serverless stability)
    await adminSupabase.from('documents').update({ document_summary: 'Parsing curriculum schema (Neural Node)...' }).eq('id', documentId);
    
    let extractedText = "";
    try {
      // pdf-parse uses a built-in fake worker that is much more stable on Vercel
      const data = await pdf(buffer);
      extractedText = data.text.trim();
    } catch (parseErr: any) {
      console.error("PDF Extraction Fault:", parseErr);
      throw new Error(`Neural extraction engine fault: ${parseErr.message}`);
    }

    if (extractedText.length < 20) {
      throw new Error("Extraction result: The document contains insufficient text data for synthesis.");
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
    
    // CRITICAL: Force terminal failure state so UI stops polling
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Extraction Fault: ${error.message}`
    }).eq('id', documentId);
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}