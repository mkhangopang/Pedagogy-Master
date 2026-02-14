
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';
import { convertToPedagogicalMarkdown } from '../../../../../lib/rag/md-converter';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minute window for Master MD Synthesis

/**
 * SURGICAL INGESTION REPAIR (v27.0 - RECOVERY MODE)
 * Logic: [RAW_TEXT] -> MASTER MD (UNIVERSAL) -> VECTOR SYNC -> ENRICHMENT
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
    if (!token) throw new Error("Security handshake failed: No token provided.");

    // 1. Fetch document record
    const { data: doc, error: fetchError } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (fetchError || !doc) throw new Error("Target asset not found in grid database.");

    let rawText = doc.extracted_text || "";

    // 2. Binary Extraction Fallback (Ensures we have content to process)
    if (!rawText || rawText.length < 50) {
      await adminSupabase.from('documents').update({ document_summary: 'Extracting pedagogical segments...' }).eq('id', documentId);
      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error("Cloud vault storage node unreachable (R2).");
      
      try {
        const rawResult = await pdf(buffer);
        rawText = rawResult.text.trim();
      } catch (err) {
        console.error("PDF Extraction Fault:", err);
        throw new Error("Unable to extract text from curriculum binary.");
      }
    }

    if (rawText.length < 50) throw new Error("Document contains insufficient text for pedagogical analysis.");

    // 3. NEURAL MASTER-MD CONVERSION (Unrolled Column Protocol)
    await adminSupabase.from('documents').update({ document_summary: 'Synthesizing Master MD & Linearizing Grids...' }).eq('id', documentId);
    
    let cleanMd: string;
    try {
      // Wrap conversion in a Promise to handle potential hang-ups
      cleanMd = await Promise.race([
        convertToPedagogicalMarkdown(rawText),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Master MD Synthesis Timed Out")), 240000))
      ]);
    } catch (err: any) {
      console.warn("⚠️ Master MD Conversion Failed, using raw text fallback:", err.message);
      cleanMd = `<!-- MASTER_MD_DIALECT: Standard -->\n<!-- FALLBACK_MODE: TRUE -->\n${rawText}`;
    }

    const dialectMatch = cleanMd.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/);
    const dialect = dialectMatch ? dialectMatch[1] : 'Standard';

    // 4. High-Precision Vector Synchronization
    await adminSupabase.from('documents').update({ 
      extracted_text: cleanMd,
      status: 'indexing',
      document_summary: `Mapping ${dialect} standards to vector grid...`
    }).eq('id', documentId);

    // This is the CRITICAL STEP for RAG Precision
    await indexDocumentForRAG(documentId, cleanMd, doc.file_path, adminSupabase);

    // 5. Deep Analysis (Background - Non-blocking for the UI)
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       analyzeDocumentWithAI(documentId, user.id, adminSupabase).catch(err => {
         console.error("Background Enrichment Fault:", err);
       });
    }

    return NextResponse.json({ 
      success: true, 
      dialect: dialect,
      message: "Neural ingestion successfully synchronized."
    });

  } catch (error: any) {
    console.error("❌ [Processor Fatal]:", error);
    await adminSupabase.from('documents').update({ 
      status: 'failed', 
      error_message: error.message,
      document_summary: `Node Fault: ${error.message}`
    }).eq('id', documentId);
    
    return NextResponse.json({ error: error.message, status: 'failed' }, { status: 500 });
  }
}
