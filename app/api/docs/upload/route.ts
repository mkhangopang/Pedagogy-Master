import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../../lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { generateCurriculumJson } from '../../../../lib/curriculum/json-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * NEURAL INGESTION GATEWAY (v17.0)
 * Authoritative node for curriculum asset synchronization.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const body = await req.json();
    const { 
      name, 
      sourceType, 
      extractedText, 
      board, 
      subject, 
      grade, 
      version 
    } = body;

    const supabase = getSupabaseServerClient(token);
    
    if (sourceType !== 'markdown' || !extractedText) {
      return NextResponse.json({ error: "Policy: Only high-fidelity Markdown can be indexed for neural grounding." }, { status: 400 });
    }

    // 1. CLOUD STORAGE PERSISTENCE
    let filePath = `curricula/${user.id}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
    
    if (!isR2Configured() || !r2Client) {
      throw new Error("Cloudflare R2 node unreachable. Check infrastructure config.");
    }

    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: filePath,
      Body: Buffer.from(extractedText),
      ContentType: 'text/markdown',
    }));

    // 2. METADATA SYNCHRONIZATION
    const generatedJson = generateCurriculumJson(extractedText);

    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      user_id: user.id,
      name,
      source_type: 'markdown',
      status: 'processing',
      is_approved: true,
      extracted_text: extractedText,
      file_path: filePath,
      storage_type: 'r2',
      curriculum_name: name || `${subject} Grade ${grade}`,
      authority: board || 'General', 
      subject: subject || 'General',
      grade_level: grade || 'Auto',
      version_year: version || '2024',
      generated_json: generatedJson,
      version: 1,
      is_selected: true
    }).select().single();

    if (dbError) throw new Error(`Metadata Sync Error: ${dbError.message}`);

    // 3. NEURAL VECTOR INDEXING
    try {
      await indexDocumentForRAG(docData.id, extractedText, filePath, supabase);
      await supabase.from('documents').update({ status: 'ready', rag_indexed: true }).eq('id', docData.id);
    } catch (indexErr: any) {
      console.error('❌ [Indexing Error]:', indexErr);
      await supabase.from('documents').update({ status: 'failed' }).eq('id', docData.id);
    }

    return NextResponse.json({
      success: true,
      id: docData.id,
      message: '🛡️ Asset Grounded to Vector Grid.'
    });

  } catch (error: any) {
    console.error('Ingestion Fatal:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}