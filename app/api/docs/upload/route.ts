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

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const supabase = getSupabaseServerClient(token);
    const body = await req.json();
    const { name, sourceType, extractedText, previewOnly, metadata, slos, slo_map, isFragment, isReduce, isIntermediate } = body;
    
    if (sourceType === 'raw_text' && previewOnly) {
      let instruction = "You are a curriculum data extractor. Return valid JSON of SLOs.";
      let preferred = ""; 

      if (isReduce) {
        if (isIntermediate) {
          instruction = `COMPRESSED_REDUCTION: Merge these curriculum fragments into a structured Markdown list. Prioritize SLO codes and descriptions. Keep it dense. NO CONVERSATIONAL FILLER.`;
        } else {
          instruction = `FINAL_REDUCE_PROTOCOL: Synthesize the MASTER SINDH BIOLOGY 2024 hierarchy. Include ALL Domains (A-X). deduplicate SLOs. Use B-09-A-01 format. If too large, prioritize hierarchy completeness over lengthy explanations.`;
        }
        preferred = "gemini";
      }

      const result = await synthesize(extractedText, [], false, [], preferred, instruction, true);
      
      const jsonClean = (result.text || '{}').replace(/```json|```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(jsonClean);
      } catch (e) {
        parsed = { markdown: result.text, metadata: { grade: '9-12', board: 'Sindh' } };
      }
      return NextResponse.json(parsed);
    }

    if (sourceType === 'markdown' && extractedText) {
      const filePath = `vault/${user.id}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
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
        document_summary: `Recursive Sync Complete: Full curriculum anchored to vault.`,
        generated_json: { slos, slo_map }
      }).select().single();

      if (dbError) throw dbError;

      indexDocumentForRAG(docData.id, extractedText, filePath, supabase, { ...metadata, slos, slo_map }).catch(e => {
        console.error("Async Indexing Fault:", e);
      });

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Invalid pipeline command." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Gateway Fault]:", error);
    return NextResponse.json({ error: error.message || "Neural grid bottleneck." }, { status: 500 });
  }
}
