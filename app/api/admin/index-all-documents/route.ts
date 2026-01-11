import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonClient, getSupabaseServerClient } from '../../../../lib/supabase';
import { indexDocumentForRAG } from '../../../../lib/rag/document-indexer';
import { ADMIN_EMAILS } from '../../../../constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5-minute timeout for bulk tasks

/**
 * ADMIN BULK INDEXING
 * Scans the entire curriculum library and ensures all assets are indexed for RAG.
 * Uses robust storage key coalescing to handle various schema versions.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    // Restrict to admins
    const isAdmin = user.email && ADMIN_EMAILS.some(e => e.toLowerCase() === user.email?.toLowerCase());
    if (!isAdmin) return NextResponse.json({ error: 'Administrative access required' }, { status: 403 });

    console.log('🔄 [ADMIN] Initiating global RAG synchronization suite...');

    const supabase = getSupabaseServerClient(token);

    // Identify documents requiring indexing or re-processing
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('id, name, file_name, r2_key, storage_key, file_path, extracted_text, gemini_processed, status');

    if (fetchError) throw fetchError;

    if (!documents || documents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No documents found in the vault.',
        stats: { total: 0, processed: 0 }
      });
    }

    console.log(`📄 [ADMIN] Found ${documents.length} assets to process.`);

    const results = [];
    let successCount = 0;

    for (const doc of documents) {
      try {
        const displayName = doc.file_name || doc.name || `Node_${doc.id.substring(0,8)}`;
        console.log(`🔍 [ADMIN] Processing: ${displayName}`);
        
        // Coalesce storage keys based on database schema
        const r2Key = doc.r2_key || doc.storage_key || doc.file_path;
        
        // Trigger indexing - indexer handles text from DB vs fetch from R2
        await indexDocumentForRAG(doc.id, doc.extracted_text, r2Key, supabase);
        
        results.push({ id: doc.id, name: displayName, success: true });
        successCount++;
      } catch (e: any) {
        console.error(`❌ [ADMIN] Sync failed for ${doc.id}:`, e.message);
        results.push({ id: doc.id, name: doc.name || doc.file_name, success: false, error: e.message });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Bulk sync complete. Synchronized ${successCount}/${documents.length} assets.`,
      stats: {
        total: documents.length,
        success: successCount,
        failed: documents.length - successCount
      },
      details: results
    });

  } catch (error: any) {
    console.error('❌ [ADMIN] Bulk sync fatal error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Handle GET for convenient execution from admin dashboard links
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
