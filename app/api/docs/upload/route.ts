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

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const body = await req.json();
    const { name, sourceType, extractedText, board, subject, grade, version } = body;

    const supabase = getSupabaseServerClient(token);
    
    if (sourceType !== 'markdown' || !extractedText) {
      return NextResponse.json({ error: "High-fidelity Markdown source is mandatory." }, { status: 400 });
    }

    // 1. Cloud Storage Persistence
    let filePath = `curricula/${user.id}/${Date.now()}_${name.replace(/\s+/g, '_')}.md`;
    if (!isR2Configured() || !r2Client) throw new Error("Storage node unreachable.");

    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: filePath,
      Body: Buffer.from(extractedText),
      ContentType: 'text/markdown',
    }));

    // 2. ATOMIC EXCLUSIVE SELECTION (Fix 7)
    // Deselect all previous documents to ensure the neural brain focuses on exactly ONE asset.
    const { error: unselectError } = await supabase
      .from('documents')
      .update({ is_selected: false })
      .eq('user_id', user.id);
    
    if (unselectError) console.warn('Failed to unselect previous assets:', unselectError);

    const generatedJson = generateCurriculumJson(extractedText);

    // 3. Database Metadata Commitment
    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      user_id: user.id,
      name,
      source_type: 'markdown',
      status: 'processing',
      is_approved: true,
      extracted_text: extractedText,
      file_path: filePath,
      storage_type: 'r2',
      curriculum_name: name,
      authority: board || 'General', 
      subject: subject || 'General',
      grade_level: grade || 'Auto',
      version_year: version || '2024',
      generated_json: generatedJson,
      is_selected: true, // Auto-select new document
      rag_indexed: false
    }).select().single();

    if (dbError) throw dbError;

    // 4. Background Neural Synchronization
    console.log(`📡 [Ingestion] Initializing neural synchronization for asset: ${docData.id}`);
    indexDocumentForRAG(docData.id, extractedText, filePath, supabase)
      .then(() => console.log(`✅ [Ingestion] Neural sync complete for ${docData.id}`))
      .catch(e => console.error(`❌ [Ingestion] Neural sync failed:`, e));

    return NextResponse.json({ 
      success: true, 
      id: docData.id,
      message: 'Document uploaded and indexing started' 
    });

  } catch (error: any) {
    console.error("❌ [Upload Route] Ingestion Fatal:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}