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
 * WORLD-CLASS INGESTION GATEWAY (v129.0)
 * Optimized for Sindh Biology 2024 (185 Pages) & Map-Reduce Architecture.
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
    const { name, sourceType, extractedText, previewOnly, metadata, slos, slo_map } = body;
    
    // PHASE 1: Distributed Map-Reduce Analysis
    if (sourceType === 'raw_text' && previewOnly) {
      console.log(`📡 [Gateway] Collaborative Map-Reduce Engaged for: ${name}`);
      
      const mapReduceInstruction = `You are a Lead Curriculum Engineer. 
      Analyze the SINDH BIOLOGY 2024 context using Map-Reduce logic. 
      Ensure 100% fidelity for SLO codes B-09 to B-12 and Domains A-S + X.
      Generate the Master Pedagogical Markdown and full SLO Map.`;

      // Trigger the Map-Reduce trigger in synthesizer-core
      const triggerPrompt = `MAP_REDUCE_TRIGGER: SINDH BIOLOGY 2024 CURRICULUM.
      FULL CONTENT: ${extractedText}`;

      const result = await synthesize(triggerPrompt, [], false, [], 'gemini', mapReduceInstruction);
      
      // Clean and return structured result
      const jsonClean = (result.text || '{}').replace(/```json|```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(jsonClean);
      } catch (e) {
        // Fallback for partial JSON or markdown-wrapped strings
        parsed = { markdown: result.text, metadata: { grade: '9-12', board: 'Sindh' } };
      }
      return NextResponse.json(parsed);
    }

    // PHASE 2: Zero-AI Atomic Ingestion (Permanent Vault)
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
        name: name || "Sindh Biology Master Asset",
        source_type: 'markdown',
        status: 'processing',
        extracted_text: extractedText,
        file_path: filePath,
        is_selected: true,
        subject: metadata?.subject || 'Biology',
        grade_level: metadata?.grade || '9-12',
        authority: metadata?.board || 'Sindh Board',
        difficulty_level: metadata?.difficulty || 'high',
        document_summary: `Distributed Map-Reduce Sync: ${slos?.length || 0} SLOs mapped sequentially.`,
        generated_json: { slos, slo_map }
      }).select().single();

      if (dbError) throw dbError;

      // Parallelize RAG Indexing
      indexDocumentForRAG(docData.id, extractedText, filePath, supabase, { ...metadata, slos, slo_map }).catch(e => {
        console.error("Async Indexing Fault:", e);
      });

      return NextResponse.json({ success: true, id: docData.id });
    }

    return NextResponse.json({ error: "Invalid pipeline command." }, { status: 400 });
  } catch (error: any) {
    console.error("❌ [Ingestion Fault]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}