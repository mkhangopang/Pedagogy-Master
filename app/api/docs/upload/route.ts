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
 * NEURAL INGESTION GATEWAY (v9.0)
 * Optimized for Multi-Grade (09-12) Sindh Curriculum Synthesis.
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

      if (isReduce) {
        preferred = "gemini";
        if (isIntermediate) {
          instruction = `
COMPRESSED_REDUCTION_NODE: 
Merge the following DATA_BLOCKS into a dense Markdown list. 
CRITICAL: You MUST preserve the Grade distinctions (e.g., B-09, B-10, B-11, B-12). 
Do NOT collapse different grades into a single grade list.
Keep all Domain letters (A-X) intact. No conversational filler.
`;
        } else {
          instruction = `
FINAL_REDUCE_PROTOCOL: Master Multi-Grade Synthesizer.
TASK: Transform the collected curriculum nodes into the final MASTER SINDH BIOLOGY 2024 hierarchy.

## CORE REQUIREMENTS:
1. **MULTI-GRADE SPAN**: The curriculum covers Grades 9, 10, 11, and 12. You MUST include SLOs for B-09, B-10, B-11, AND B-12.
2. **DOMAIN COMPLETENESS**: Include ALL Domains (A through X).
3. **FORMAT**: Use B-[Grade]-[Domain]-[Number] format (e.g., B-10-A-01).
4. **NO COLLAPSING**: Do not merge Grade 10 topics into Grade 9. If you see 'Grade 10' or 'B-10' in the source, it MUST appear in the output.
5. **TOKEN OPTIMIZATION**: Use a compact list format. Priority is on completeness of the SLO list across all 4 grades.

## DATA ACCESS:
BELOW ARE THE COLLECTED CURRICULUM NODES. PROCESS THEM NOW.
`;
        }
        
        const finalPrompt = `
<AUTHORITATIVE_DATA_NODES>
${extractedText}
</AUTHORITATIVE_DATA_NODES>

## COMMAND:
${instruction}

## EXECUTION RULE:
OUTPUT THE FULL 4-GRADE HIERARCHY (B-09 to B-12) NOW. START IMMEDIATELY WITH THE MARKDOWN HEADER.
`;

        const result = await synthesize(finalPrompt, [], false, [], preferred, "STRICT_EXECUTION_MODE: ON", true);
        
        let parsed;
        try {
          // Attempt to parse if the model returned JSON, otherwise treat as Markdown
          const jsonClean = (result.text || '{}').replace(/```json|```/g, '').trim();
          parsed = JSON.parse(jsonClean);
        } catch (e) {
          parsed = { markdown: result.text, metadata: { grade: '9-12', board: 'Sindh' } };
        }
        return NextResponse.json(parsed);
      }
    }

    // PHASE: FINAL VAULT LOCK
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
        document_summary: `Neural Vault v9.0: Multi-Grade Sindh Curriculum (Grades 9-12) fully indexed.`,
        generated_json: { slos, slo_map }
      }).select().single();

      if (dbError) throw new Error(`Database rejected vault entry: ${dbError.message}`);

      indexDocumentForRAG(docData.id, extractedText, filePath, supabase, { ...metadata, slos, slo_map }).catch(e => {
        console.error("Async Indexing Fault:", e);
      });

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Invalid pipeline command." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Gateway Fault]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
