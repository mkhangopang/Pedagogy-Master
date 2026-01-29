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
 * WORLD-CLASS INGESTION GATEWAY (v120.0)
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
    const { name, sourceType, extractedText, previewOnly } = body;
    
    // PHASE 1: Neural Mapping Preview
    if (sourceType === 'raw_text' && previewOnly) {
      console.log(`🧠 [Ingestion] Advanced Mapping: ${name}`);
      const systemInstruction = `You are a Lead Curriculum Architect. Parse input into structured PEDAGOGICAL MARKDOWN. Use hierarchical blocks for Domain, Standard, Benchmark, and SLO codes. Output ONLY Markdown.`;
      const prompt = `Synthesize this raw text into standardized standards: ${extractedText.substring(0, 100000)}`;

      const { text, provider } = await synthesize(prompt, [], false, [], 'gemini', systemInstruction);
      return NextResponse.json({ markdown: text, provider });
    }

    // PHASE 2: Permanent Vaulting
    if (sourceType === 'markdown' && extractedText) {
      const filePath = `vault/${user.id}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
      if (!isR2Configured() || !r2Client) throw new Error("Cloud Storage Offline.");

      await r2Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: filePath,
        Body: Buffer.from(extractedText),
        ContentType: 'text/markdown',
      }));

      await supabase.from('documents').update({ is_selected: false }).eq('user_id', user.id);

      const { data: docData, error: dbError } = await supabase.from('documents').insert({
        user_id: user.id,
        name,
        source_type: 'markdown',
        status: 'processing',
        extracted_text: extractedText,
        file_path: filePath,
        is_selected: true,
        rag_indexed: false
      }).select().single();

      if (dbError) throw dbError;

      // Start high-fidelity indexing (Await for stability in serverless)
      try {
        await indexDocumentForRAG(docData.id, extractedText, filePath, supabase);
      } catch (e) {
        console.error("Async indexing warning:", e);
      }

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Invalid Node Command." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Ingestion Fault]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}