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
 * NEURAL INGESTION GATEWAY (v10.0)
 * Optimized for High-Volume Sindh Biology Ingestion (185 Pages)
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
    
    // BRANCH A: AI PRE-SYNC (Fragment Mapping, Tier Merging, Final Reduction)
    if (sourceType === 'raw_text' && previewOnly) {
      let instruction = "";
      let preferred = "gemini"; 
      let finalPrompt = "";

      if (isReduce) {
        // REDUCTION PROTOCOL (The bottleneck phase)
        if (isIntermediate) {
          instruction = "REDUCTION_PROTOCOL_ALPHA: Merge these DATA_BLOCKS into a dense Markdown list. PRESERVE ALL GRADES (B-09, B-10, B-11, B-12). No chat. Start immediately with markdown.";
        } else {
          instruction = "FINAL_SYNTHESIS_OMEGA: BELOW IS THE FULL REDUCED CURRICULUM. You must generate the official MASTER SINDH BIOLOGY 2024 hierarchy. You MUST include SLOs for ALL 4 GRADES (9-12). Format: B-[Grade]-[Domain]-[Number].";
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
DO NOT SAY "I AM READY". DO NOT ASK FOR DATA. DATA IS ALREADY PROVIDED IN THE TAGS ABOVE. 
GENERATE THE COMPLETE MARKDOWN LIST NOW.
[/STRICT_RULE]
`;
      } else {
        // MAPPING PHASE (The initial segments)
        instruction = "MAPPING_PROTOCOL: Extract every Student Learning Outcome (SLO) from this fragment. Use the format [SLO:CODE] Description.";
        finalPrompt = `[DATA_FRAGMENT]:\n${extractedText}\n\n[EXECUTE]: ${instruction}`;
      }

      const result = await synthesize(finalPrompt, [], false, [], preferred, "STRICT_DATA_ENGINE: ACTIVE", true);
      
      const jsonClean = (result.text || '{}').replace(/```json|```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(jsonClean);
      } catch (e) {
        // If the model returned pure markdown instead of JSON, wrap it correctly
        parsed = { markdown: result.text, metadata: { grade: '9-12', board: 'Sindh' } };
      }
      return NextResponse.json(parsed);
    }

    // BRANCH B: FINAL VAULT LOCK (Approved Hierarchy)
    if (sourceType === 'markdown' && extractedText) {
      console.log(`🔒 [Vault Lock] Finalizing asset: ${name}`);
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
        document_summary: `Neural Vault v10.0: Comprehensive Quad-Grade (9-12) Sindh Curriculum Synced.`,
        generated_json: { slos, slo_map }
      }).select().single();

      if (dbError) throw new Error(`Database Error: ${dbError.message}`);

      // Async Indexing
      indexDocumentForRAG(docData.id, extractedText, filePath, supabase, { ...metadata, slos, slo_map }).catch(e => {
        console.error("Indexing Fault:", e);
      });

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Pipeline configuration mismatch. Branch exhausted." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Gateway Fatal]:", error);
    return NextResponse.json({ error: error.message || "Synthesis grid exception." }, { status: 500 });
  }
}
