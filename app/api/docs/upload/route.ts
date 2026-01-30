import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { getSynthesizer } from '../../../../lib/ai/synthesizer-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10; 

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const supabase = getSupabaseServerClient(token);
    const body = await req.json();
    const { name, sourceType, extractedText, previewOnly, metadata } = body;
    
    if (sourceType === 'raw_text' && previewOnly) {
      const synth = getSynthesizer();
      const instruction = `
# PULSE CLEANER
INPUT: Curriculum blocks.
TASK: Extract SLO codes and descriptions. 
OUTPUT: Verbatim Markdown list. No chat.
FORMAT: - SLO:[CODE]: [DESCRIPTION]
`;
      const result = await synth.synthesize(`${instruction}\n\nINPUT_PULSE:\n${extractedText}`);
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
        name: name || "Curriculum Vault",
        source_type: 'markdown',
        status: 'processing',
        extracted_text: extractedText,
        file_path: filePath,
        is_selected: true,
        subject: metadata?.subject || 'Biology',
        grade_level: metadata?.grade || '9-12',
        authority: metadata?.board || 'Sindh Board',
        document_summary: `Neural Pulse Sync Complete.`
      }).select().single();

      if (dbError) throw new Error(dbError.message);

      indexDocumentForRAG(docData.id, extractedText, filePath, supabase, metadata).catch(console.error);

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Pulse configuration mismatch." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Upload Gateway Pulse Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}