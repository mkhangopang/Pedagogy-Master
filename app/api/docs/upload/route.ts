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
 * NEURAL INGESTION GATEWAY (v9.5)
 * Fixed: Mapping Phase Fallthrough Bug.
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
    
    // PHASE 1/2: AI PRE-SYNC (Fragment Mapping & Recursive Reduction)
    if (sourceType === 'raw_text' && previewOnly) {
      let instruction = "You are a curriculum data extractor. Return valid JSON of SLOs.";
      let preferred = "gemini"; 
      let finalPrompt = "";

      if (isReduce) {
        if (isIntermediate) {
          instruction = "REDUCTION_TASK: Merge these nodes into a dense Markdown list. PRESERVE GRADE LEVELS (B-09, B-10, B-11, B-12). No chat.";
        } else {
          instruction = "FINAL_REDUCE_PROTOCOL: Synthesize the MASTER SINDH BIOLOGY 2024 hierarchy for ALL Grades (9-12). Use B-09, B-10, B-11, B-12 prefixes. Format: B-[Grade]-[Domain]-[Num].";
        }
        
        finalPrompt = `
<SOURCE_NODES_TO_PROCESS>
${extractedText}
</SOURCE_NODES_TO_PROCESS>

## CRITICAL COMMAND:
${instruction}

## EXECUTION RULE:
PROCESS THE NODES ABOVE NOW. DO NOT ASK FOR PERMISSION. DO NOT SAY "I AM READY". START MARKDOWN OUTPUT IMMEDIATELY.
`;
      } else {
        // MAPPING PHASE (The part that was causing the 400 error)
        instruction = "MAPPING_TASK: Extract every Student Learning Outcome (SLO) from this fragment. Use the format [SLO:CODE] Description.";
        finalPrompt = `DATA: ${extractedText}\n\nCOMMAND: ${instruction}`;
      }

      const result = await synthesize(finalPrompt, [], false, [], preferred, "STRICT_DATA_ONLY_MODE: ON", true);
      
      const jsonClean = (result.text || '{}').replace(/```json|```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(jsonClean);
      } catch (e) {
        parsed = { markdown: result.text, metadata: { grade: '9-12', board: 'Sindh' } };
      }
      return NextResponse.json(parsed);
    }

    // PHASE 3: FINAL VAULT LOCK (Approved Markdown)
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
        document_summary: `Neural Vault v9.5: Multi-Grade Sindh Curriculum (Grades 9-12) fully indexed.`,
        generated_json: { slos, slo_map }
      }).select().single();

      if (dbError) throw new Error(`Database rejected vault entry: ${dbError.message}`);

      indexDocumentForRAG(docData.id, extractedText, filePath, supabase, { ...metadata, slos, slo_map }).catch(e => {
        console.error("Async Indexing Fault:", e);
      });

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Invalid pipeline command node." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Gateway Fault]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
