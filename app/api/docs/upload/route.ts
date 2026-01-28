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
 * ARCHITECTURAL SINDH INGESTION GATEWAY (v95.0)
 * Specialized for the 2024 Progression Grid (Grades 9-12).
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
      
      if (sourceType === 'raw_text' && previewOnly) {
        console.log(`🧠 [Ingestion] Executing Deep Mapping for: ${name}`);
        
        const systemInstruction = `You are the Lead Curriculum Architect for the Sindh Education Department.
        TASK: Parse this Biology Curriculum (IX-XII) into a neat, high-fidelity PEDAGOGICAL MARKDOWN.
        
        STRUCTURE LOGIC (SINDH 2024 SPECIFIC):
        1. HIERARCHY: Level 1 = DOMAIN [LETTER] (e.g., DOMAIN B: MOLECULAR BIOLOGY).
        2. LEVEL 2 = Standard (Verbatim).
        3. LEVEL 3 = Benchmark (Numbered).
        4. SLO CODES: These are the core. Format them EXACTLY as:
           "- SLO:B-09-A-01: Description"
           "- SLO:B-10-A-02: Description"
           Note: B=Biology, 09/10/11/12=Grade, Letter=Domain, Number=Objective.
        
        GRID PROCESSING:
        - The source contains 'Progression Grids' where Grades IX, X, XI, and XII are columns.
        - You MUST split these columns into separate sections or clearly labeled blocks.
        - Ensure every SLO code is extracted. Do NOT summarize or skip any code.
        
        OUTPUT RULES:
        - Start with '# Curriculum Metadata' (Board: Sindh, Subject: Biology, Grade: IX-XII, Version: 2024).
        - Use ONLY Markdown. No chat, no intro.`;
        
        const prompt = `Synthesize this raw curriculum text into the Sindh Standardized Markdown Grid.
        
        RAW INPUT STREAM:
        ${extractedText.substring(0, 150000)}`;

        const { text, provider } = await synthesize(
          prompt,
          [],
          false,
          [],
          'gemini', 
          systemInstruction
        );

        // Quality check for Sindh-specific codes
        const codeDensity = (text.match(/SLO:B-/g) || []).length;
        console.log(`📡 [Ingestion] Generated via ${provider}. SLO Code Density: ${codeDensity}`);

        return NextResponse.json({ markdown: text, provider });
      }

      if (sourceType === 'markdown' && extractedText) {
        return await commitToVault(user.id, name, extractedText, { board, subject, grade, version }, supabase);
      }
      return NextResponse.json({ error: "Invalid protocol node." }, { status: 400 });
    }

    return NextResponse.json({ error: "Protocol Error." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Ingestion Fault]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function commitToVault(userId: string, name: string, md: string, metadata: any, supabase: any) {
  const filePath = `curricula/${userId}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
  if (!isR2Configured() || !r2Client) throw new Error("Storage Offline.");

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
    authority: metadata.board || generatedJson.metadata?.board || 'Sindh',
    subject: metadata.subject || generatedJson.metadata?.subject || 'Biology',
    grade_level: metadata.grade || generatedJson.metadata?.grade || 'IX-XII',
    version_year: metadata.version || generatedJson.metadata?.version || '2024',
    generated_json: generatedJson,
    is_selected: true,
    rag_indexed: false
  }).select().single();

  if (dbError) throw dbError;

  try {
    await indexDocumentForRAG(docData.id, md, filePath, supabase);
  } catch (e) {
    console.error("Indexing error:", e);
  }

  return NextResponse.json({ success: true, id: docData.id });
}