import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseAdminClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * NEURAL PROCESSING NODE (v8.1)
 * Optimized for robustness in Vercel Serverless environment.
 * Uses dynamic import for pdf-parse to avoid build-time filesystem errors.
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
      throw new Error("Zero-byte binary stream detected. Re-upload required.");
    }

    // 4. Extract Text (Using serverless-friendly pdf-parse with dynamic import)
    await adminSupabase.from('documents').update({ document_summary: 'Parsing curriculum schema (Neural Extraction)...' }).eq('id', documentId);
    
    let extractedText = "";
    try {
      // Dynamic import prevents pdf-parse from trying to access its internal test files during Next.js build
      const pdf = (await import('pdf-parse')).default;
      const data = await pdf(buffer);
      extractedText = data.text || "";
    } catch (parseErr: any) {
      console.error("PDF Extraction Failed:", parseErr);
      throw new Error(`Neural extraction engine fault: ${parseErr.message}`);
    }

    if (extractedText.trim().length < 20) {
      throw new Error("The document appears to be empty or contains only non-extractable imagery.");
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
      // We continue to AI analysis even if vector indexing is slow
    }

    // 6. Pedagogical Intelligence Extraction
    await adminSupabase.from('documents').update({ document_summary: 'Synthesizing pedagogical metadata & SLO maps...' }).eq('id', documentId);
    
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       try {
         await analyzeDocumentWithAI(documentId, user.id, adminSupabase);
       } catch (aiErr: any) {
         console.error("AI Analysis Failed:", aiErr);
         // Don't fail the whole document if summary fails
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