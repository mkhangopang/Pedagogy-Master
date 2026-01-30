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
 * NEURAL INGESTION GATEWAY (v11.0)
 * Optimized for Multi-Node Load Balancing across 185+ pages.
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
    const { name, sourceType, extractedText, previewOnly, metadata, slos, slo_map, isReduce, isIntermediate, isFragment } = body;
    
    // BRANCH A: AI PRE-SYNC
    if (sourceType === 'raw_text' && previewOnly) {
      let instruction = "";
      // FIX: Removed hardcoded preferred = "gemini" to allow grid balancing
      let preferred = undefined; 
      let finalPrompt = "";

      if (isReduce) {
        if (isIntermediate) {
          instruction = "REDUCTION_PROTOCOL_ALPHA: Merge these DATA_BLOCKS into a dense Markdown list. PRESERVE ALL GRADES (B-09, B-10, B-11, B-12). No chat.";
        } else {
          instruction = "FINAL_SYNTHESIS_OMEGA: BELOW IS THE FULL REDUCED CURRICULUM. Generate official MASTER SINDH BIOLOGY 2024 hierarchy (9-12). Format: B-[Grade]-[Domain]-[Number].";
          preferred = "gemini"; // Force Gemini only for the final massive context reduction
        }
        
        finalPrompt = `
[SYSTEM_EXECUTION_MODE: MANDATORY]
[INPUT_DATA_NODES]
${extractedText}
[/INPUT_DATA_NODES]

[COMMAND]
${instruction}
[/COMMAND]

[STRICT_RULE]
DO NOT SAY "I AM READY". GENERATE THE COMPLETE MARKDOWN LIST NOW.
[/STRICT_RULE]
`;
      } else {
        instruction = "MAPPING_PROTOCOL: Extract every Student Learning Outcome (SLO) from this fragment. Use format [SLO:CODE] Description.";
        finalPrompt = `[DATA_FRAGMENT]:\n${extractedText}\n\n[EXECUTE]: ${instruction}`;
      }

      const result = await synthesize(finalPrompt, [], false, [], preferred, "STRICT_DATA_ENGINE: ACTIVE", true);
      
      const jsonClean = (result.text || '{}').replace(/```json|```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(jsonClean);
      } catch (e) {
        parsed = { markdown: result.text, metadata: { grade: '9-12', board: 'Sindh' } };
      }
      return NextResponse.json(parsed);
    }

    // BRANCH B: FINAL VAULT LOCK
    if (sourceType === 'markdown' && extractedText) {
      const fileNameClean = (name || "Sindh_Master").replace(/\s+/g, '_');
      const filePath = `vault/${user.id}/${Date.now()}_${fileNameClean}.md`;
      
      if (!isR2Configured() || !r2Client) throw new Error("Cloud Storage Offline.");

      await r2Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: filePath,
        Body: Buffer.from(extractedText),
        ContentType: 'text/markdown',
      }));

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
        document_summary: `Neural Vault v11.0: Balanced Multi-Node Sync (185pg).`,
        generated_json: { slos, slo_map }
      }).select().single();

      if (dbError) throw new Error(`Database Error: ${dbError.message}`);

      indexDocumentForRAG(docData.id, extractedText, filePath, supabase, { ...metadata, slos, slo_map }).catch(e => {
        console.error("Indexing Fault:", e);
      });

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Pipeline configuration mismatch." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Gateway Fatal]:", error);
    // Error Sanitizer: Clean up JSON code from message
    let cleanMsg = error.message || "Synthesis grid exception.";
    if (cleanMsg.includes('{"error"')) {
      try {
        const parsed = JSON.parse(cleanMsg.substring(cleanMsg.indexOf('{')));
        cleanMsg = `AI Grid Alert: ${parsed.error?.message || "Rate Limit Reached."}`;
      } catch(e) {}
    }
    return NextResponse.json({ error: cleanMsg }, { status: 500 });
  }
}