import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { getSynthesizer } from '../../../../lib/ai/synthesizer-core';

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
    const { name, sourceType, extractedText, previewOnly, metadata, slos, slo_map, isReduce } = body;
    
    if (sourceType === 'raw_text' && previewOnly) {
      const synth = getSynthesizer();

      // INSTRUCTION: Enforce strict B-09 to B-12 filtering for 185pg docs
      const instruction = `
TASK: CURRICULUM GRID CLEANER.
INPUT: Raw text containing curriculum SLOs.
FILTER: Extract ONLY Student Learning Objectives (SLOs) starting with codes B-09, B-10, B-11, or B-12.
FORMAT: 
# Curriculum Metadata
Board: Sindh
Subject: Biology
Grade: 9-12

# Master Curriculum Grid
- SLO:[CODE]: [VERBATIM_DESCRIPTION]

RULES: 
1. DO NOT add chat or explanation. 
2. IGNORE all text that is not a target SLO.
3. PRESERVE THE HIERARCHY.
`;
      
      const result = await synth.synthesize(`${instruction}\n\nINPUT_TEXT:\n${extractedText}`, { type: 'reduce' });
      return NextResponse.json({ markdown: result.text, provider: result.provider });
    }

    if (sourceType === 'markdown' && extractedText) {
      const fileNameClean = (name || "Curriculum").replace(/\s+/g, '_');
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
        document_summary: `Precision Ingestion: 185pg Skim Complete. B9-B12 focused.`,
        generated_json: { slos, slo_map }
      }).select().single();

      if (dbError) throw new Error(dbError.message);

      indexDocumentForRAG(docData.id, extractedText, filePath, supabase, metadata).catch(console.error);

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Pipeline configuration mismatch." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Upload Gateway Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}