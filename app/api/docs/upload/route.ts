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
 * HIGH-FIDELITY NEURAL INGESTION GATEWAY (v90.0)
 * Orchestrates multiple AI models (Gemini, ChatGPT, DeepSeek, Groq) to finish document mapping.
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
      
      // PHASE 1: Neural Synthesis (Raw Text -> Structured PEDAGOGICAL MARKDOWN)
      if (sourceType === 'raw_text' && previewOnly) {
        console.log(`🧠 [Ingestion] Orchestrating Multi-Model Synthesis for: ${name}`);
        
        const systemInstruction = `You are a world-class curriculum data architect specializing in Sindh Board and International Standards.
        TASK: Convert messy OCR/extracted text into perfectly structured PEDAGOGICAL MARKDOWN.
        
        CRITICAL RULES:
        1. IDENTITY: Start with '# Curriculum Metadata' listing Board, Subject, Grade, and Version.
        2. HIERARCHY: Use DOMAIN, STANDARD, and BENCHMARK headers.
        3. SLO VERBATIM: Extract every Student Learning Objective (SLO) code and description EXACTLY as written.
           - FORMAT: "- SLO:[CODE]: [Verbatim Description]"
           - Example: "- SLO:S-04-A-01: Identify and describe basic parts of a plant."
        4. GRIDS: If the source contains tables/grids, convert them into Markdown tables.
        5. NO SUMMARIES: Do not skip content. Map the entire source.
        6. NO CONVERSATION: Output ONLY markdown.`;
        
        const prompt = `Convert this raw curriculum text into high-fidelity pedagogical markdown.
        
        SOURCE INPUT:
        ${extractedText.substring(0, 120000)}`;

        // Attempt orchestration with automatic failover handled in synthesizer-core
        // Logic will try Gemini Pro -> OpenAI GPT-4o -> DeepSeek R1 -> Groq
        const { text, provider } = await synthesize(
          prompt,
          [],
          false,
          [],
          'gemini', // Start with Gemini but allow core to hop
          systemInstruction
        );

        // Quality Guard: Check for SLO presence
        const sloCount = (text.match(/- SLO:/g) || []).length;
        console.log(`✅ [Orchestrator] ${provider} produced mapping with ${sloCount} detected SLOs.`);

        if (sloCount < 3 && extractedText.length > 5000) {
          console.warn(`⚠️ [Quality Warning] Detected low SLO count from ${provider}. Retrying with OpenAI...`);
          const retry = await synthesize(prompt, [], false, [], 'openai', systemInstruction);
          return NextResponse.json({ markdown: retry.text, provider: `openai_retry_${retry.provider}` });
        }

        return NextResponse.json({ markdown: text, provider });
      }

      // PHASE 2: Permanent Commit (MD -> R2 -> Vector DB)
      if (sourceType === 'markdown' && extractedText) {
        return await commitToVault(user.id, name, extractedText, { board, subject, grade, version }, supabase);
      }
      return NextResponse.json({ error: "Invalid protocol node." }, { status: 400 });
    }

    return NextResponse.json({ error: "Protocol Error: Ingestion requires JSON streams." }, { status: 400 });

  } catch (error: any) {
    console.error("❌ [Ingestion Critical Fault]:", error);
    const isRateLimit = error.message?.includes('429') || error.message?.includes('quota');
    return NextResponse.json({ 
      error: isRateLimit ? "Neural Grid Saturated. Please retry document mapping in 60s." : (error.message || "Synthesis grid exception.")
    }, { status: isRateLimit ? 429 : 500 });
  }
}

async function commitToVault(userId: string, name: string, md: string, metadata: any, supabase: any) {
  const filePath = `curricula/${userId}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
  
  if (!isR2Configured() || !r2Client) throw new Error("Storage Infrastructure Offline.");

  // 1. Persistent Artifact Storage
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: filePath,
    Body: Buffer.from(md),
    ContentType: 'text/markdown',
  }));

  // 2. Metadata Node Generation
  const generatedJson = generateCurriculumJson(md);

  // 3. Document Status Selection
  await supabase.from('documents').update({ is_selected: false }).eq('user_id', userId);

  // 4. Atomic Database Record
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

  // 5. Background Neural Indexing
  try {
    await indexDocumentForRAG(docData.id, md, filePath, supabase);
  } catch (e) {
    console.error("Vector synchronization delayed:", e);
  }

  return NextResponse.json({ success: true, id: docData.id });
}
