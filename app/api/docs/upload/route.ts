import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { generateCurriculumJson } from '../../../../lib/curriculum/json-generator';
import { synthesize } from '../../../../lib/ai/synthesizer-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

/**
 * RESILIENT NEURAL INGESTION GATEWAY (v85.0)
 * Logic: Uses the global synthesizer grid to ensure mapping succeeds even under heavy load.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const supabase = getSupabaseServerClient(token);
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      const { name, sourceType, extractedText, board, subject, grade, version, previewOnly } = body;
      
      // PHASE 1: Neural Synthesis using the Multi-Model Grid
      if (sourceType === 'raw_text' && previewOnly) {
        console.log(`🧠 [Ingestion] Engaging grid for mapping: ${name}`);
        
        const systemInstruction = "You are a world-class curriculum data architect. Convert raw text into standardised PEDAGOGICAL MARKDOWN using DOMAIN, STANDARD, BENCHMARK, and SLO blocks.";
        
        const prompt = `Convert this raw text into high-fidelity markdown standards. 
        RULES: Start with '# Curriculum Metadata', use '- SLO:CODE: Verbatim Description', and keep tables intact.
        
        INPUT:
        ${extractedText.substring(0, 100000)}`;

        // This call will automatically hop providers if Gemini fails
        const { text } = await synthesize(
          prompt,
          [],
          false,
          [],
          'gemini',
          systemInstruction
        );

        return NextResponse.json({ markdown: text });
      }

      // PHASE 2: Permanent Commit
      if (sourceType === 'markdown' && extractedText) {
        return await commitToVault(user.id, name, extractedText, { board, subject, grade, version }, supabase);
      }
      return NextResponse.json({ error: "Invalid ingestion protocol." }, { status: 400 });
    }

    return NextResponse.json({ error: "Unsupported payload format." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Ingestion Fatal]:", error);
    return NextResponse.json({ 
      error: error.message?.includes('429') ? "Neural Grid Saturated. Please retry in 60s." : error.message 
    }, { status: error.message?.includes('429') ? 429 : 500 });
  }
}

async function commitToVault(userId: string, name: string, md: string, metadata: any, supabase: any) {
  const filePath = `curricula/${userId}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
  if (!isR2Configured() || !r2Client) throw new Error("Storage node unreachable.");

  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: filePath,
    Body: Buffer.from(md),
    ContentType: 'text/markdown',
  }));

  const generatedJson = generateCurriculumJson(md);
  await supabase.from('documents').update({ is_selected: false }).eq('user_id', userId);

  const { data: docData, error: dbError } = await supabase.from('documents').insert({
    user_id: userId,
    name,
    source_type: 'markdown',
    status: 'processing',
    extracted_text: md,
    file_path: filePath,
    storage_type: 'r2',
    authority: metadata.board || generatedJson.metadata?.board || 'General',
    subject: metadata.subject || generatedJson.metadata?.subject || 'General',
    grade_level: metadata.grade || generatedJson.metadata?.grade || 'Auto',
    version_year: metadata.version || generatedJson.metadata?.version || '2024',
    generated_json: generatedJson,
    is_selected: true,
    rag_indexed: false
  }).select().single();

  if (dbError) throw dbError;

  try {
    await indexDocumentForRAG(docData.id, md, filePath, supabase);
  } catch (e) {
    console.error("Indexing fault:", e);
  }

  return NextResponse.json({ success: true, id: docData.id });
}