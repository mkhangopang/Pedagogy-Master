
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '../../../../../lib/supabase';
import { getObjectBuffer } from '../../../../../lib/r2';
import { indexDocumentForRAG } from '../../../../../lib/rag/document-indexer';
import { analyzeDocumentWithAI } from '../../../../../lib/ai/document-analyzer';
import { convertToPedagogicalMarkdown } from '../../../../../lib/rag/md-converter';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * NEURAL PROCESSING GATEWAY (v26.0 - UNIVERSAL)
 * Protocol: [RAW_TEXT] -> MASTER MD (UNIVERSAL) -> VECTOR SYNC -> ENRICHMENT
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
    if (!token) throw new Error("Security handshake failed: No token.");

    // 1. Fetch document record
    const { data: doc, error: fetchError } = await adminSupabase.from('documents').select('*').eq('id', documentId).single();
    if (fetchError || !doc) throw new Error("Target asset not found in grid.");

    let rawText = doc.extracted_text || "";

    // 2. Fallback: Binary Extraction
    if (!rawText || rawText.length < 50) {
      await adminSupabase.from('documents').update({ document_summary: 'Extracting pedagogical nodes...' }).eq('id', documentId);
      const buffer = await getObjectBuffer(doc.file_path);
      if (!buffer) throw new Error("Cloud vault storage unreachable.");
      const rawResult = await pdf(buffer);
      rawText = rawResult.text.trim();
    }

    if (rawText.length < 50) throw new Error("Document contains insufficient text content.");

    // 3. NEURAL MASTER-MD CONVERSION (v25.0 Universal)
    await adminSupabase.from('documents').update({ document_summary: 'Synthesizing Master MD & Linearizing Grids...' }).eq('id', documentId);
    
    const cleanMd = await convertToPedagogicalMarkdown(rawText);
    const dialectMatch = cleanMd.match(/<!-- MASTER_MD_DIALECT: (.+?) -->/);
    const dialect = dialectMatch ? dialectMatch[1] : 'Standard';

    // 4. High-Precision Vector Synchronization
    await adminSupabase.from('documents').update({ 
      extracted_text: cleanMd,
      status: 'indexing',
      document_summary: `Mapping ${dialect} standards to vector grid...`
    }).eq('id', documentId);

    await indexDocumentForRAG(documentId, cleanMd, doc.file_path, adminSupabase);

    // 5. Deep Analysis (Background)
    const { data: { user } } = await (getSupabaseServerClient(token)).auth.getUser(token);
    if (user) {
       analyzeDocumentWithAI(documentId, user.id, adminSupabase).catch(console.error);
    }

    return NextResponse.json({ 
      success: true, 
      dialect: dialect,
      message: "Neural ingestion complete."
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
