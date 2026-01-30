import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { synthesize } from '../../../../lib/ai/synthesizer-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * NEURAL INGESTION GATEWAY (v8.0)
 * Optimized for Sindh 185-page Massive Reduction.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const supabase = getSupabaseServerClient(token);
    const body = await req.json();
    const { name, sourceType, extractedText, previewOnly, metadata, slos, slo_map, isReduce, isIntermediate } = body;
    
    // PHASE: AI PRE-SYNC (Reduction & Extraction)
    if (sourceType === 'raw_text' && previewOnly) {
      let instruction = "You are a curriculum data extractor. Return valid JSON of SLOs.";
      let preferred = ""; 

      // DATA-FIRST PROMPT CONSTRUCTION
      // Prevents the "Okay, I am ready. Send me nodes" hallucination.
      let finalPrompt = "";

      if (isReduce) {
        preferred = "gemini";
        if (isIntermediate) {
          instruction = "COMPRESSED_REDUCTION: Merge the following DATA_BLOCKS into a dense, hierarchical Markdown list. No chat. No intro.";
        } else {
          instruction = "FINAL_REDUCE_PROTOCOL: You are the Master Synthesizer. BELOW ARE THE COLLECTED CURRICULUM NODES. Transform them into the final MASTER SINDH BIOLOGY 2024 hierarchy. Include ALL Domains (A-X). Use B-09-A-01 format. If exceeding token limits, prioritize list completeness over detailed paragraphs.";
        }
        
        finalPrompt = `
<AUTHORITATIVE_DATA_NODES>
${extractedText}
</AUTHORITATIVE_DATA_NODES>

## COMMAND:
${instruction}

## EXECUTION RULE:
PROCESS THE ABOVE NODES NOW. DO NOT ASK FOR PERMISSION. DO NOT SAY YOU ARE READY. START THE MARKDOWN OUTPUT IMMEDIATELY.
`;
      } else {
        finalPrompt = `DATA: ${extractedText}\n\nCOMMAND: ${instruction}`;
      }

      const result = await synthesize(finalPrompt, [], false, [], preferred, "STRICT_EXECUTION_MODE: ON", true);
      
      const jsonClean = (result.text || '{}').replace(/```json|```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(jsonClean);
      } catch (e) {
        parsed = { markdown: result.text, metadata: { grade: '9-12', board: 'Sindh' } };
      }
      return NextResponse.json(parsed);
    }

    // PHASE: FINAL VAULT LOCK (Save to R2 & DB)
    if (sourceType === 'markdown' && extractedText) {
      console.log(`🔒 [Vault Lock] Finalizing asset: ${name}`);
      
      const fileNameClean = (name || "Sindh_Master").replace(/\s+/g, '_');
      const filePath = `vault/${user.id}/${Date.now()}_${fileNameClean}.md`;
      
      if (!isR2Configured() || !r2Client) throw new Error("Cloud Storage Offline. Check R2 credentials.");

      // 1. Physical Archive
      await r2Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: filePath,
        Body: Buffer.from(extractedText),
        ContentType: 'text/markdown',
      }));

      // 2. Metadata Handshake
      const { data: docData, error: dbError } = await supabase.from('documents').insert({
        user_id: user.id,
        name: name || "Sindh Biology Master",
        source_type: 'markdown',
        status: 'processing',
        extracted_text: extractedText,
        file_path: filePath,
        is_selected: true,
        subject: metadata?.subject || 'Biology',
        grade_level: metadata?.grade || '9-12',
        authority: metadata?.board || 'Sindh Board',
        difficulty_level: metadata?.difficulty || 'high',
        document_summary: `Vault Sync v8.0 Complete: 185-page curriculum anchored via recursive reduction.`,
        generated_json: { slos, slo_map }
      }).select().single();

      if (dbError) {
        console.error("DB Error during Vault Lock:", dbError);
        throw new Error(`Database rejected vault entry: ${dbError.message}`);
      }

      // 3. Trigger Neural Vector Mapping (Async)
      indexDocumentForRAG(docData.id, extractedText, filePath, supabase, { ...metadata, slos, slo_map }).catch(e => {
        console.error("Async Indexing Fault:", e);
      });

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Invalid pipeline command." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Gateway Fault]:", error);
    return NextResponse.json({ 
      error: error.message || "The Neural Grid encountered a bottleneck. Refresh and retry." 
    }, { status: 500 });
  }
}
