import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { getSynthesizer } from '../../../../lib/ai/synthesizer-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// VERCEL OPTIMIZATION: 60s is plenty for a 2,000-char pulse
export const maxDuration = 60; 

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
    
    // MICRO-PULSE HANDLER: Cleans a small segment of text quickly
    if (sourceType === 'raw_text' && previewOnly) {
      const synth = getSynthesizer();
      const instruction = `
# PULSE CLEANER v2 (Vercel Optimized)
TASK: Extract SLO codes and descriptions from this segment.
OUTPUT: Verbatim Markdown list.
FORMAT: - SLO:[CODE]: [DESCRIPTION]
LIMIT: Do not add conversational text.
`;
      const result = await synth.synthesize(`${instruction}\n\nINPUT_SEGMENT:\n${extractedText.substring(0, 5000)}`);
      return NextResponse.json({ markdown: result.text, provider: result.provider });
    }

    // FINAL COMMIT HANDLER: Saves the fully cleaned curriculum
    if (sourceType === 'markdown' && extractedText) {
      const fileNameClean = (name || "Curriculum").replace(/\s+/g, '_');
      const filePath = `vault/${user.id}/${Date.now()}_${fileNameClean}.md`;
      
      if (!isR2Configured() || !r2Client) throw new Error("Cloud Storage Offline.");

      // 1. Storage Node Sync
      await r2Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: filePath,
        Body: Buffer.from(extractedText),
        ContentType: 'text/markdown',
      }));

      // 2. Database Node Sync
      const { data: docData, error: dbError } = await supabase.from('documents').insert({
        user_id: user.id,
        name: name || "Curriculum Vault",
        source_type: 'markdown',
        status: 'processing',
        extracted_text: extractedText,
        file_path: filePath,
        is_selected: true,
        subject: metadata?.subject || 'General',
        grade_level: metadata?.grade || 'Mixed',
        authority: metadata?.board || 'Sindh Board',
        document_summary: `Neural Pulse Aggregation Successful.`
      }).select().single();

      if (dbError) throw new Error(dbError.message);

      // 3. Vector Grid Indexing (Non-blocking trigger for Vercel)
      // We use a promise here that doesn't block the response, 
      // but note that Vercel may kill it if the response finishes too early.
      // This is why we poll for 'ready' status in the UI.
      indexDocumentForRAG(docData.id, extractedText, filePath, supabase, metadata).catch(err => {
        console.error("Vector Grid Sync Error:", err);
      });

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Pulse configuration mismatch." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Upload Gateway Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}